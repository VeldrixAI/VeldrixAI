"""
VeldrixAI — Zero-integration global intercept example.
One line activates monitoring for ALL AI providers.
"""
import veldrixai
from veldrixai.http_interceptor import enable_global_intercept

# 1. Create client
client = veldrixai.Veldrix(api_key="vx-live-your-key-here")

# 2. Enable global monitoring (patches httpx + requests globally)
enable_global_intercept(client)

# 3. Use ANY AI SDK as normal — VeldrixAI captures everything automatically
import openai
openai_client = openai.OpenAI(api_key="sk-your-openai-key")

response = openai_client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Explain quantum entanglement simply."}]
)

print(response.choices[0].message.content)
# VeldrixAI has already evaluated this exchange in the background
