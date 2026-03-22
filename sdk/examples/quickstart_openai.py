"""VeldrixAI + OpenAI SDK."""

from veldrixai import Veldrix, GuardConfig
from openai    import OpenAI

client  = OpenAI()
veldrix = Veldrix(api_key="vx-live-your-key-here")


# Block harmful responses automatically
@veldrix.guard(config=GuardConfig(block_on_verdict=["BLOCK"]))
def chat(messages):
    return client.chat.completions.create(
        model="gpt-4o",
        messages=messages,
    )


if __name__ == "__main__":
    from veldrixai import VeldrixBlockError

    try:
        response = chat([{"role": "user", "content": "Hello, how are you?"}])
        print(response.choices[0].message.content)
        print(f"Trust: {response.trust.verdict} ({response.trust.overall:.0%})")
    except VeldrixBlockError as e:
        print(f"Blocked: {e}")
