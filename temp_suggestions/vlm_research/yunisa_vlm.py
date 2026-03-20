import torch
import torch.nn as nn
from transformers import AutoModel, AutoModelForCausalLM, PreTrainedModel, PretrainedConfig

class YunisaVLMConfig(PretrainedConfig):
    model_type = "yunisa_vlm"
    def __init__(self, vision_model_id="google/siglip-so400m-patch14-384", 
                 text_model_id="microsoft/bitnet-b1.58-2B-4T", 
                 vision_hidden_size=1152, text_hidden_size=2048, **kwargs):
        super().__init__(**kwargs)
        self.vision_model_id = vision_model_id
        self.text_model_id = text_model_id
        self.vision_hidden_size = vision_hidden_size
        self.text_hidden_size = text_hidden_size

class MLPProjector(nn.Module):
    """The 'Optic Nerve': maps SigLIP output dimensions to BitNet dimensions."""
    def __init__(self, in_features, out_features):
        super().__init__()
        self.linear1 = nn.Linear(in_features, out_features, bias=True)
        self.act = nn.GELU()
        self.linear2 = nn.Linear(out_features, out_features, bias=True)
    def forward(self, x):
        return self.linear2(self.act(self.linear1(x)))

class YunisaVLM(PreTrainedModel):
    config_class = YunisaVLMConfig
    
    def __init__(self, config):
        super().__init__(config)
        
        # Auto-detect CUDA to ensure we utilize Nvidia hardware natively for vision tasks
        self.device_target = "cuda" if torch.cuda.is_available() else "cpu"
        
        # Vision Encoder - The "Eyes" (Using Google SigLIP)
        self.vision_model = AutoModel.from_pretrained(config.vision_model_id).to(self.device_target)
        
        # Multimodal Projector 
        self.projector = MLPProjector(config.vision_hidden_size, config.text_hidden_size).to(self.device_target)
        
        # 1-bit Language Model Backbone - The "Brain" (BitNet)
        # Note for Inception Architecture:
        # PENDING: Future architecture iteration will swap AutoModelForCausalLM 
        # for tensorrt_llm.Builder to maximize inference throughput on RTX edge devices.
        self.language_model = AutoModelForCausalLM.from_pretrained(config.text_model_id).to(self.device_target)
        
        # Freeze vision model to save VRAM and keep pre-trained feature extraction stable
        for param in self.vision_model.parameters():
            param.requires_grad = False
            
    def get_input_embeddings(self, input_ids, pixel_values=None):
        text_embeds = self.language_model.get_input_embeddings()(input_ids)
        if pixel_values is None:
            return text_embeds
            
        # Get image features
        vision_outputs = self.vision_model(pixel_values=pixel_values)
        # Sequence of patch embeddings
        image_features = vision_outputs.last_hidden_state
        
        # Project image features to text dimension
        image_embeds = self.projector(image_features)
        return text_embeds, image_embeds
        
    def forward(self, input_ids, pixel_values=None, attention_mask=None, labels=None):
        """
        A simplified forward pass showing the VLM alignment mechanics.
        In a full LLaVA pipeline, you interleave image_embeds at <image> tokens.
        Here we prepend the image embeddings to the sequence.
        """
        if pixel_values is not None:
            text_embeds, image_embeds = self.get_input_embeddings(input_ids, pixel_values)
            # Concatenate image embeddings at the start of the sequence
            inputs_embeds = torch.cat([image_embeds, text_embeds], dim=1)
            
            # Adjust attention mask and labels for the prepended image tokens
            if attention_mask is not None:
                img_mask = torch.ones(image_embeds.shape[:2], device=attention_mask.device)
                attention_mask = torch.cat([img_mask, attention_mask], dim=1)
            
            if labels is not None:
                img_labels = torch.full(image_embeds.shape[:2], -100, device=labels.device)
                labels = torch.cat([img_labels, labels], dim=1)
                
            return self.language_model(inputs_embeds=inputs_embeds, attention_mask=attention_mask, labels=labels)
        else:
            return self.language_model(input_ids=input_ids, attention_mask=attention_mask, labels=labels)
