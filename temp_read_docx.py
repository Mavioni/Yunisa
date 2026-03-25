import zipfile
import xml.etree.ElementTree as ET
import sys

def extract_text_from_docx(docx_path):
    text: list[str] = []
    with zipfile.ZipFile(docx_path) as docx:
        xml_content = docx.read('word/document.xml')
        tree = ET.fromstring(xml_content)
        ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
        for para in tree.findall('.//w:p', ns):
            para_texts = [str(node.text) for node in para.findall('.//w:t', ns) if node.text]
            if para_texts:
                text.append(''.join(para_texts))
    return '\n'.join(text)

if __name__ == "__main__":
    if len(sys.argv) > 1:
        path = sys.argv[1]
        try:
            print(extract_text_from_docx(path))
        except Exception as e:
            print(f"Error reading docx: {e}")
    else:
        print("Usage: python temp_read_docx.py <path>")
