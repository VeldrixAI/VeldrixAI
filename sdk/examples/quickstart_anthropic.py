"""VeldrixAI — Anthropic SDK integration example."""
import anthropic
import veldrixai
from veldrixai.http_interceptor import enable_global_intercept

# Enable global monitoring
client = veldrixai.Veldrix(api_key="vx-live-your-key-here")
enable_global_intercept(client)

# Use Anthropic SDK normally
ant = anthropic.Anthropic(api_key="your-anthropic-key")
message = ant.messages.create(
    model="claude-opus-4-6",
    max_tokens=1024,
    messages=[{"role": "user", "content": "What is the capital of France?"}]
)
print(message.content[0].text)
