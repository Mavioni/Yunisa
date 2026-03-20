# YunisaVLM Process Maps 

These interactive diagrams map out the macro-architecture, the training sequence, and the deployment pathways for the custom 1-bit Vision-Language model.

## 1. Architectural Mind Map
This map visualizes the core components and datasets intersecting to create the VLM brain.

```mermaid
mindmap
  root((YunisaVLM))
    Vision Encoder
      Google SigLIP
      So400m Patch14
      Frozen Weights
    Projector Optic Nerve
      Multi-Layer Perceptron
      GELU Activation
      bfloat16 precision
    Language Brain
      Microsoft BitNet b1.58
      Ternary Weights -1/0/1
    Training Data
      LLaVA-Instruct-150K
      Screenshot Contexts
      Bounding Box Coordinates
    Infrastructure
      PyTorch DDP
      8x Nvidia H100
      HuggingFace Accelerate
```

## 2. End-to-End Training Sequence Diagram
This diagram outlines the flow of data through the PyTorch pipeline over time.

```mermaid
sequenceDiagram
    participant D as LLaVA Dataset
    participant V as SigLIP Encoder
    participant P as MLP Projector
    participant B as BitNet LLM
    participant L as Loss & Optimizer
    
    D->>V: 1. Input Image Raw Pixels
    D->>B: 1b. Input Text Instructions
    
    Note over V: Frozen (requires_grad=False)
    V->>P: 2. Extract Hidden State (dim: 1152)
    
    Note over P: Active (bfloat16 training)
    P->>B: 3. Upscale & Align (dim: 2048)
    
    Note over B: 1-Bit Causal Forward Pass
    B->>L: 4. Predict Next Token
    
    L-->>P: 5. Backpropagate Gradients
    
    Note over P: Weights updated via AdamW
```

## 3. Deployment Flowchart
Once the projector has been trained in the cloud, this is the path to deploying it back down to your local Yunisa app.

```mermaid
flowchart TD
    A[Cloud Training Finish] -->|Download Checkpoints| B(Local PC)
    B --> C{Merge Checkpoints}
    C -->|GGUF Conversion| D(llama.cpp Compiler)
    
    D --> E[Export to bitnet-vlm.gguf]
    E --> F[Move to Yunisa resources/models]
    
    F --> G[Restart Yunisa App]
    G --> H[llama-server Loads VLM]
    H --> I[Agent-S Sees Webpages Locally!]
    
    style A fill:#ff9900,color:#fff
    style D fill:#003f5c,color:#fff
    style I fill:#00ff00,stroke:#333,color:#000
```
