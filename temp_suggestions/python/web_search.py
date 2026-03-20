"""Web search using DuckDuckGo — zero dependencies, stdlib only."""

import json
import re
import urllib.request
import urllib.parse
import html


def search(query: str, max_results: int = 5) -> list[dict]:
    """Search DuckDuckGo and return a list of {title, url, snippet} dicts."""
    results = []

    # Try DuckDuckGo HTML lite (no JS required, easy to parse)
    try:
        results = _search_ddg_html(query, max_results)
    except Exception:
        pass

    # Fallback: DuckDuckGo Instant Answer API (more limited but reliable)
    if not results:
        try:
            results = _search_ddg_api(query, max_results)
        except Exception:
            pass

    return results


def fetch_page(url: str, max_chars: int = 8000) -> str:
    """Fetch a web page and return its text content (stripped of HTML tags)."""
    try:
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Accept": "text/html,application/xhtml+xml",
            },
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            raw = resp.read().decode("utf-8", errors="replace")

        # Strip scripts and style tags
        text = re.sub(r"<script[^>]*>[\s\S]*?</script>", "", raw, flags=re.I)
        text = re.sub(r"<style[^>]*>[\s\S]*?</style>", "", text, flags=re.I)
        # Strip all HTML tags
        text = re.sub(r"<[^>]+>", " ", text)
        # Decode HTML entities
        text = html.unescape(text)
        # Collapse whitespace
        text = re.sub(r"\s+", " ", text).strip()

        return text[:max_chars]
    except Exception as e:
        return f"[Failed to fetch page: {e}]"


def _search_ddg_html(query: str, max_results: int) -> list[dict]:
    """Parse DuckDuckGo HTML search results."""
    encoded = urllib.parse.urlencode({"q": query})
    url = f"https://html.duckduckgo.com/html/?{encoded}"

    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "text/html",
        },
    )

    with urllib.request.urlopen(req, timeout=10) as resp:
        page = resp.read().decode("utf-8", errors="replace")

    results = []

    # Parse result blocks — DuckDuckGo HTML has class="result__a" for links
    link_pattern = r'class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)</a>'
    snippet_pattern = r'class="result__snippet"[^>]*>([\s\S]*?)</(?:a|td|div|span)'

    links = re.findall(link_pattern, page)
    snippets = re.findall(snippet_pattern, page)

    for i, (raw_url, raw_title) in enumerate(links[:max_results]):
        # Clean URL (DDG wraps URLs in a redirect)
        actual_url = raw_url
        uddg_match = re.search(r'uddg=([^&]+)', raw_url)
        if uddg_match:
            actual_url = urllib.parse.unquote(uddg_match.group(1))

        title = re.sub(r"<[^>]+>", "", raw_title).strip()
        title = html.unescape(title)

        snippet = ""
        if i < len(snippets):
            snippet = re.sub(r"<[^>]+>", "", snippets[i]).strip()
            snippet = html.unescape(snippet)

        if title and actual_url:
            results.append({
                "title": title,
                "url": actual_url,
                "snippet": snippet,
            })

    return results


def _search_ddg_api(query: str, max_results: int) -> list[dict]:
    """Use DuckDuckGo Instant Answer API as fallback."""
    encoded = urllib.parse.urlencode({"q": query, "format": "json", "no_html": "1"})
    url = f"https://api.duckduckgo.com/?{encoded}"

    req = urllib.request.Request(
        url,
        headers={"User-Agent": "YUNISA/1.0"},
    )

    with urllib.request.urlopen(req, timeout=10) as resp:
        data = json.loads(resp.read().decode())

    results = []

    # Abstract (main answer)
    if data.get("Abstract"):
        results.append({
            "title": data.get("Heading", "Answer"),
            "url": data.get("AbstractURL", ""),
            "snippet": data["Abstract"],
        })

    # Related topics
    for topic in data.get("RelatedTopics", [])[:max_results - len(results)]:
        if isinstance(topic, dict) and topic.get("Text"):
            results.append({
                "title": topic.get("Text", "")[:80],
                "url": topic.get("FirstURL", ""),
                "snippet": topic.get("Text", ""),
            })

    return results


if __name__ == "__main__":
    import sys
    query = " ".join(sys.argv[1:]) or "python programming"
    for r in search(query):
        print(f"  {r['title']}")
        print(f"  {r['url']}")
        print(f"  {r['snippet'][:120]}")
        print()
