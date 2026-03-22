"""
VeldrixAI + LiteLLM — 60-second quickstart.
Every chat() call is automatically evaluated. No other changes needed.
"""

from veldrixai import Veldrix
from litellm   import completion
from typing    import List, Dict

veldrix = Veldrix(api_key="vx-live-your-key-here")


@veldrix.guard
def chat(messages: List[Dict]) -> any:
    return completion(
        model="openai/gpt-4o",
        messages=messages,
        max_tokens=1024,
    )


if __name__ == "__main__":
    msgs = [{"role": "user", "content": "Explain quantum entanglement simply."}]
    response = chat(msgs)

    # Existing code unchanged
    print(response.choices[0].message.content)

    # VeldrixAI trust scores — new, additive
    print(f"\nVerdict:     {response.trust.verdict}")
    print(f"Trust Score: {response.trust.overall:.0%}")
    print(f"Request ID:  {response.trust.request_id}")
    for pillar, score in response.trust.pillar_scores.items():
        print(f"  {pillar:<20} {score:.0%}")
