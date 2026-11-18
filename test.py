
import httpx

BASE_URL = "http://127.0.0.1:31415/v1"
API_KEY = "freellmapi-a026ab359989b79b7c089482e2a47cf96c4db4ded5851849"

def ask_ai(question: str):
    response = httpx.post(
        f"{BASE_URL}/chat/completions",
        headers={
            "Authorization": f"Bearer {API_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "model": "auto",
            "messages": [
                {
                    "role": "user",
                    "content": question,
                }
            ],
        },
        timeout=120.0,
    )

    if response.status_code != 200:
        print("Status:", response.status_code)
        print("Error:", response.text)

    response.raise_for_status()

    data = response.json()
    return data["choices"][0]["message"]["content"]


answer = ask_ai("top 3 ai engineerng projects")
print(answer)
