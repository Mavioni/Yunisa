"""NVIDIA NIM Bridge — stdlib-only interface to NVIDIA Inference Microservices."""

import os
import json
import logging
import urllib.request
import urllib.error


class NvidiaNIMBridge:
    """
    Bridge class to interface with NVIDIA NIM (NVIDIA Inference Microservices)
    endpoints for enterprise-grade reasoning. This aligns Yunisa with the
    Hybrid Edge orchestration pattern, falling back to NIM API when heavy
    compute is required beyond local hardware capabilities.
    """

    def __init__(self, api_key: str | None = None,
                 base_url: str = "https://api.nvcf.nvidia.com/v2/nvcf/pexec/functions/") -> None:
        self.api_key = api_key or os.environ.get("NVIDIA_API_KEY", "")
        self.base_url = base_url
        self.logger = logging.getLogger("NvidiaNIMBridge")

        if not self.api_key:
            self.logger.warning("NVIDIA_API_KEY is not set. NIM Bridge will fail on requests.")

    def run_inference(self, invoke_url: str, payload: dict) -> list[str]:
        """
        Executes a direct inference call against a specific Nvidia NIM model container.
        Returns a list of decoded response lines.
        """
        body = json.dumps(payload).encode('utf-8')
        req = urllib.request.Request(
            invoke_url,
            data=body,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Accept": "text/event-stream",
                "Content-Type": "application/json",
            },
            method="POST",
        )

        lines: list[str] = []
        try:
            with urllib.request.urlopen(req, timeout=60) as response:
                for raw_line in response:
                    decoded = raw_line.decode("utf-8").strip()
                    if decoded:
                        lines.append(decoded)
        except urllib.error.HTTPError as e:
            self.logger.error(f"NVIDIA NIM Endpoint Error: {e.code} {e.reason}")
            raise
        except urllib.error.URLError as e:
            self.logger.error(f"NVIDIA NIM Connection Error: {e.reason}")
            raise

        return lines
