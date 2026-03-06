import requests
import json
import time

# 定义openai客户端：构造函数接收的API基础URL和密钥
class OpenAIClient:
    def __init__(self, api_key, base_url):
        self.api_key = api_key
        self.base_url = base_url
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }

    def make_request(self, model, messages):
        url = f"{self.base_url}/chat/completions"

        #默认参数
        payload = {
            "model": model,
            "messages": messages,
            "stream": False,
            "max_tokens": 2048,
            "temperature": 0.7,
            "top_p": 1.0
        }

        response = requests.post(
            url=url,
            headers=self.headers,
            json=payload
        )
        return response
    
    def extract_response(self, result):
        if "choices" in result and len(result["choices"]) > 0:
            message = result["choices"][0].get("message", {})
            content = message.get("content", "")
            reasoning = message.get("reasoning", "")

            finish_reason = result["choices"][0].get("finish_reason", "")
            usage = result.get("usage", {})
            completion_tokens = usage.get("completion_tokens", 0)
            prompt_tokens = usage.get("prompt_tokens", 0)

            print(f"Tokens使用: 提示 = {prompt_tokens}, 完成 = {completion_tokens}")
            print(f"结束原因: {finish_reason}")
            print()
            
            print("推理过程" )
            print("=" * 20)
            print(reasoning)
            print("=" * 20)
            print("模型回复:")
            print("=" * 20)
            print(content)
            print("=" * 20)

            return {
                "reasoning": reasoning,
                "content": content,
                "role": message.get("role", "assistant"),
                "finish_reason": finish_reason,
                "usage": usage,
                "full_response": result
            }
        else:
            print("响应中未找到有效内容")
            return None

    
    def chat_completion(self, model, messages):
        response = self.make_request(model, messages)
        print(response)

        if response.status_code != 200:
            print(f"HTTP请求失败: {response.status_code} - {response.text}")
            return None
        
        result = response.json()
        #print("完整响应:")
        #print(json.dumps(result, indent=2, ensure_ascii=False))
        return self.extract_response(result)
    
    def chat(self, model, messages):
        result = self.chat_completion(model, messages)

        if result:
            return result["content"]
        else:
            return None
            

if __name__ == "__main__":
    base_url = "http://127.0.0.1:11434/v1"  # 替换为你的API基础URL
    api_key = "sk-xxx"  # 替换为你的API密钥
    model = "qwen3.5:9b"  # 替换为你想使用的模型

    
    client = OpenAIClient(api_key, base_url)
    user_input = input("请输入你的问题: ")
    messages = [
        {"role": "system", "content": "你是一个有帮助的助手。"},
        {"role": "user", "content": f"{user_input}"}
    ]
    response = client.chat(model, messages)


# class StateMachine:
#     def __init__(self):
#         self.current_state = "idle"  # 初始状态：空闲
#         self.transitions = {
#             "idle": {"w": "walk", "a": "attack"},
#             "walk": {"space": "jump"},
#             "jump": {"a": "attack"}
#         }

#     def handle_event(self, event):
#         """
#         根据当前状态和事件触发转移。

#         :param event: 用户输入的事件
#         """
#         if event in self.transitions.get(self.current_state, {}):
#             self.current_state = self.transitions[self.current_state][event]
#         # 否则保持当前状态（无转移）

# # 主程序
# if __name__ == "__main__":
#     print("🎮 角色状态机 demo (按 w/空格/a 操作)")
#     sm = StateMachine()
#     while True:
#         print(f"当前状态: {sm.current_state}")
#         event = input("按 'w' 行走, 'space' 跳跃, 'a' 攻击 (输入事件): ").strip().lower()
        
#         # 验证事件输入
#         if event not in ["w", "space", "a"]:
#             print("无效的事件，请输入 'w', 'space', 或 'a'")
#             continue
        
#         sm.handle_event(event)
