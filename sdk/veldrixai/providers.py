"""
VeldrixAI — Known AI Provider Endpoint Registry
Used by the HTTP interceptor to identify AI calls regardless of which
SDK or HTTP library the developer uses.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class ProviderEndpoint:
    name:          str
    url_patterns:  list[str]
    request_paths: list[str]
    adapter_key:   str
    region:        str = "global"


PROVIDER_REGISTRY: list[ProviderEndpoint] = [
    ProviderEndpoint(
        name="OpenAI",
        url_patterns=["api.openai.com"],
        request_paths=["/v1/chat/completions", "/v1/completions", "/v1/responses"],
        adapter_key="openai",
    ),
    ProviderEndpoint(
        name="Azure OpenAI",
        url_patterns=["openai.azure.com", ".cognitiveservices.azure.com"],
        request_paths=["/openai/deployments/"],
        adapter_key="azure_openai",
        region="us",
    ),
    ProviderEndpoint(
        name="Anthropic",
        url_patterns=["api.anthropic.com"],
        request_paths=["/v1/messages", "/v1/complete"],
        adapter_key="anthropic",
    ),
    ProviderEndpoint(
        name="Google Gemini",
        url_patterns=["generativelanguage.googleapis.com"],
        request_paths=["/v1beta/models/", "/v1/models/"],
        adapter_key="google",
    ),
    ProviderEndpoint(
        name="Google Vertex AI",
        url_patterns=["aiplatform.googleapis.com", "-aiplatform.googleapis.com"],
        request_paths=["/v1/projects/", "/v1beta1/projects/"],
        adapter_key="google",
        region="us",
    ),
    ProviderEndpoint(
        name="AWS Bedrock",
        url_patterns=["bedrock-runtime.amazonaws.com", "bedrock.amazonaws.com"],
        request_paths=["/model/", "/invoke", "/invoke-with-response-stream"],
        adapter_key="aws_bedrock",
        region="us",
    ),
    ProviderEndpoint(
        name="Cohere",
        url_patterns=["api.cohere.com", "api.cohere.ai"],
        request_paths=["/v1/chat", "/v1/generate", "/v2/chat"],
        adapter_key="cohere",
    ),
    ProviderEndpoint(
        name="Mistral AI",
        url_patterns=["api.mistral.ai"],
        request_paths=["/v1/chat/completions"],
        adapter_key="mistral",
    ),
    ProviderEndpoint(
        name="Groq",
        url_patterns=["api.groq.com"],
        request_paths=["/openai/v1/chat/completions"],
        adapter_key="openai",
    ),
    ProviderEndpoint(
        name="Together AI",
        url_patterns=["api.together.xyz", "api.together.ai"],
        request_paths=["/v1/chat/completions", "/inference"],
        adapter_key="openai",
    ),
    ProviderEndpoint(
        name="Fireworks AI",
        url_patterns=["api.fireworks.ai"],
        request_paths=["/inference/v1/chat/completions"],
        adapter_key="openai",
    ),
    ProviderEndpoint(
        name="Perplexity",
        url_patterns=["api.perplexity.ai"],
        request_paths=["/chat/completions"],
        adapter_key="openai",
    ),
    ProviderEndpoint(
        name="Replicate",
        url_patterns=["api.replicate.com"],
        request_paths=["/v1/predictions", "/v1/models/"],
        adapter_key="generic",
    ),
    ProviderEndpoint(
        name="Hugging Face Inference",
        url_patterns=["api-inference.huggingface.co", "huggingface.co/api"],
        request_paths=["/models/"],
        adapter_key="huggingface",
    ),
    ProviderEndpoint(
        name="Hugging Face TGI",
        url_patterns=[".huggingface.cloud", "-tgi."],
        request_paths=["/generate", "/v1/chat/completions"],
        adapter_key="huggingface",
    ),
    ProviderEndpoint(
        name="NVIDIA NIM",
        url_patterns=["integrate.api.nvidia.com", "nim.developer.nvidia.com"],
        request_paths=["/v1/chat/completions"],
        adapter_key="openai",
    ),
    ProviderEndpoint(
        name="AI21 Labs",
        url_patterns=["api.ai21.com"],
        request_paths=["/studio/v1/", "/v1/chat/completions"],
        adapter_key="generic",
    ),
    ProviderEndpoint(
        name="OpenRouter",
        url_patterns=["openrouter.ai"],
        request_paths=["/api/v1/chat/completions"],
        adapter_key="openai",
    ),
    ProviderEndpoint(
        name="LiteLLM Proxy",
        url_patterns=["litellm.proxy", "0.0.0.0:4000", "localhost:4000"],
        request_paths=["/chat/completions", "/v1/chat/completions"],
        adapter_key="litellm",
    ),
    ProviderEndpoint(
        name="Ollama",
        url_patterns=["localhost:11434", "127.0.0.1:11434", "ollama"],
        request_paths=["/api/chat", "/api/generate", "/v1/chat/completions"],
        adapter_key="ollama",
    ),
    ProviderEndpoint(
        name="vLLM",
        url_patterns=["localhost:8080"],
        request_paths=["/v1/chat/completions", "/v1/completions"],
        adapter_key="openai",
    ),
    ProviderEndpoint(
        name="Aleph Alpha",
        url_patterns=["api.aleph-alpha.com"],
        request_paths=["/complete", "/chat"],
        adapter_key="generic",
        region="eu",
    ),
    ProviderEndpoint(
        name="Scaleway Generative APIs",
        url_patterns=["api.scaleway.ai", "generative-apis.scaleway.com"],
        request_paths=["/v1/chat/completions"],
        adapter_key="openai",
        region="eu",
    ),
    ProviderEndpoint(
        name="DeepSeek",
        url_patterns=["api.deepseek.com"],
        request_paths=["/chat/completions", "/v1/chat/completions"],
        adapter_key="deepseek",
        region="apac",
    ),
    ProviderEndpoint(
        name="Alibaba Qwen (Dashscope)",
        url_patterns=["dashscope.aliyuncs.com"],
        request_paths=["/compatible-mode/v1/chat/completions", "/api/v1/services/"],
        adapter_key="qwen",
        region="china",
    ),
    ProviderEndpoint(
        name="Baidu ERNIE",
        url_patterns=["aip.baidubce.com", "qianfan.baidubce.com"],
        request_paths=["/rpc/2.0/ai_custom/v1/wenxinworkshop/chat/"],
        adapter_key="generic",
        region="china",
    ),
    ProviderEndpoint(
        name="Zhipu AI (ChatGLM)",
        url_patterns=["open.bigmodel.cn"],
        request_paths=["/api/paas/v4/chat/completions"],
        adapter_key="openai",
        region="china",
    ),
    ProviderEndpoint(
        name="Moonshot AI (Kimi)",
        url_patterns=["api.moonshot.cn"],
        request_paths=["/v1/chat/completions"],
        adapter_key="openai",
        region="china",
    ),
    ProviderEndpoint(
        name="MiniMax",
        url_patterns=["api.minimax.chat", "api.minimaxi.com"],
        request_paths=["/v1/text/chatcompletion_pro", "/v1/text/chatcompletion_v2"],
        adapter_key="generic",
        region="china",
    ),
    ProviderEndpoint(
        name="01.AI (Yi)",
        url_patterns=["api.lingyiwanwu.com"],
        request_paths=["/v1/chat/completions"],
        adapter_key="openai",
        region="china",
    ),
    ProviderEndpoint(
        name="Tencent Hunyuan",
        url_patterns=["hunyuan.tencentcloudapi.com"],
        request_paths=["/"],
        adapter_key="generic",
        region="china",
    ),
]


def match_provider(url: str) -> Optional[ProviderEndpoint]:
    """Return the first matching provider for a given URL, or None."""
    url_lower = url.lower()
    for provider in PROVIDER_REGISTRY:
        for pattern in provider.url_patterns:
            if pattern in url_lower:
                return provider
    return None


def is_ai_endpoint(url: str) -> bool:
    return match_provider(url) is not None
