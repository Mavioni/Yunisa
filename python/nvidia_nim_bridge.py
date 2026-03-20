import os
import requests
import json
import logging

class NvidiaNIMBridge:
    """
    Bridge class to interface with NVIDIA NIM (NVIDIA Inference Microservices) 
    endpoints for enterprise-grade reasoning. This aligns Yunisa with the 
    Hybrid Edge orchestration pattern, falling back to NIM API when heavy 
    compute is required beyond local hardware capabilities.
    """
    def __init__(self, api_key=None, base_url="https://api.nvcf.nvidia.com/v2/nvcf/pexec/functions/"):
        self.api_key = api_key or os.environ.get("NVIDIA_API_KEY")
        self.base_url = base_url
        self.logger = logging.getLogger("NvidiaNIMBridge")
        
        if not self.api_key:
            self.logger.warning("NVIDIA_API_KEY is not set. NIM Bridge will fail on requests.")

    def run_inference(self, invoke_url, payload):
        """
        Executes a direct inference call against a specific Nvidia NIM model container.
        """
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Accept": "text/event-stream",
            "Content-Type": "application/json",
        }

        try:
            response = requests.post(invoke_url, headers=headers, json=payload, stream=True)
            response.raise_for_status()
            for line in response.iter_lines():
                if line:
                    yield line.decode("utf-8")
        except requests.exceptions.HTTPError as e:
            self.logger.error(f"NVIDIA NIM Endpoint Error: {e}")
            raise
