# VeldrixAI Python SDK

Runtime trust infrastructure for AI applications. Add one decorator to any LLM call —
every prompt and response is automatically evaluated across five trust pillars and logged
to your VeldrixAI dashboard.

## Install

```bash
pip install veldrixai
```

With provider extras:

```bash
pip install veldrixai[openai]       # OpenAI SDK support
pip install veldrixai[anthropic]    # Anthropic SDK support
pip install veldrixai[langchain]    # LangChain support
pip install veldrixai[all]          # All providers
```

## Quickstart

```python
from veldrixai import Veldrix
from litellm   import completion

veldrix = Veldrix(api_key="vx-live-...")

@veldrix.guard
def chat(messages):
    return completion(model="openai/gpt-4o", messages=messages)

response = chat([{"role": "user", "content": "Hello"}])
print(response.choices[0].message.content)   # unchanged
print(response.trust.verdict)                # ALLOW
print(response.trust.overall)                # 0.94
```

## What gets evaluated automatically

| Pillar           | What it checks                          |
|------------------|-----------------------------------------|
| Safety           | Toxicity, harmful content               |
| Hallucination    | Factual accuracy and grounding          |
| Bias & Fairness  | Demographic bias, stereotyping          |
| Prompt Security  | Jailbreaks, prompt injection            |
| Compliance / PII | GDPR, HIPAA, PII exposure               |

Every result is logged to your dashboard at https://app.veldrix.ai automatically.

## Works with any LLM framework

- OpenAI SDK, Azure OpenAI
- Anthropic (Claude)
- Google Gemini / Vertex AI
- AWS Bedrock
- Cohere, Mistral, Groq, Together AI, Fireworks AI
- DeepSeek, Qwen, Zhipu AI, Moonshot AI
- LiteLLM, LangChain, LlamaIndex
- Ollama, vLLM, LocalAI
- Any function that returns a string or chat completion object

## Sync evaluation (scripts, Jupyter, Django)

```python
trust = veldrix.evaluate_sync(
    prompt="What is the capital of France?",
    response="Paris is the capital of France.",
)
print(trust.verdict, trust.overall)
```

## Async evaluation

```python
trust = await veldrix.evaluate(
    prompt="What is the capital of France?",
    response="Paris is the capital of France.",
)
```

## Block harmful responses automatically

```python
from veldrixai import GuardConfig, VeldrixBlockError

@veldrix.guard(config=GuardConfig(block_on_verdict=["BLOCK"]))
def chat(messages):
    return completion(model="openai/gpt-4o", messages=messages)

try:
    response = chat(messages)
except VeldrixBlockError as e:
    return "I can't help with that."
```

## Async decorator

```python
@veldrix.guard
async def chat(messages):
    return await async_openai_client.chat.completions.create(...)

response = await chat(messages)
print(response.trust.verdict)
```

## Global HTTP intercept (zero code changes)

```python
from veldrixai import Veldrix
from veldrixai.http_interceptor import enable_global_intercept

veldrix = Veldrix(api_key="vx-live-...")
enable_global_intercept(veldrix)

# Use ANY AI SDK as normal — all calls are monitored automatically
```

## FastAPI middleware

```python
from veldrixai.middleware import VeldrixMiddleware

app.add_middleware(VeldrixMiddleware, api_key="vx-live-...")
```

## Flask

```python
from veldrixai.middleware import init_flask

init_flask(app, api_key="vx-live-...")
```

## Requirements

- Python 3.10+
- `httpx >= 0.27`
- `pydantic >= 2.0`

## Links

- Dashboard: https://app.veldrix.ai
- Docs: https://docs.veldrix.ai
- Changelog: [CHANGELOG.md](CHANGELOG.md)
- API Reference: https://docs.veldrix.ai/api
