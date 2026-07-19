# Copilot Custom Endpoint Model Fetcher (Hỗ trợ Fetch Model cho GitHub Copilot Custom Endpoint)

VS Code Extension hỗ trợ tự động fetch danh sách models từ Custom Endpoint của bạn và cấu hình trực tiếp vào GitHub Copilot trên VS Code (thông qua file `chatLanguageModels.json`).

---

## 🌟 Tính năng chính (Key Features)

- **Tự động quét & tìm kiếm cấu hình**: Định vị chính xác file cấu hình `chatLanguageModels.json` của VS Code trên mọi nền tảng (Windows, macOS, Linux, VS Code Insiders).
- **Tương thích hoàn toàn với chuẩn OpenAI**: Gửi yêu cầu tới `<Base URL>/models` bằng API Key để lấy toàn bộ danh sách models khả dụng.
- **Tự động cấu hình thông minh (Smart Parameter Resolution)**:
  - Nhận diện các model hỗ trợ **Vision** (ví dụ: `gpt-4o`, `claude-3-5`, `gemini`).
  - Nhận diện và bật tính năng **Thinking/Reasoning** cho các model suy luận (ví dụ: `deepseek-reasoner`, `deepseek-r1`).
  - Tự động điền **maxInputTokens** & **maxOutputTokens** tối ưu cho từng loại model phổ biến (ví dụ: DeepSeek, Claude, GPT, Gemini).
  - Tự động bật **toolCalling: true** để đảm bảo model xuất hiện trong trình chọn (model picker) của Copilot Chat.
- **Giao diện thân thiện (Interactive UI)**:
  - Chọn cấu hình sẵn có hoặc tạo mới trực tiếp từ thanh Command Palette.
  - Hỗ trợ chọn nhanh nhiều model cùng lúc (multi-select) bằng danh sách QuickPick.
  - Giữ lại các cấu hình tuỳ chỉnh cũ (như giới hạn token, tên riêng) của bạn mà không lo bị ghi đè mất dữ liệu.
- **An toàn bảo mật (Security First)**: Giữ nguyên cơ chế Secret Storage (`${input:chat.lm.secret.xxx}`) của VS Code và chỉ sử dụng API Key tạm thời để thực hiện fetch, không lưu trữ khóa dạng plaintext trừ khi được yêu cầu.

---

## 🚀 Hướng dẫn sử dụng (How to Use)

1. Nhấn tổ hợp phím `Ctrl + Shift + P` (hoặc `Cmd + Shift + P` trên macOS) để mở **Command Palette**.
2. Tìm kiếm và chọn lệnh: **`Copilot Custom Endpoint: Fetch and Configure Models`**.
3. **Chọn Nhà cung cấp (Provider)**:
   - Chọn nhà cung cấp Custom Endpoint hiện có trong file `chatLanguageModels.json` của bạn.
   - Hoặc chọn **`Create New Custom Endpoint Provider...`** để bắt đầu cấu hình một nhà cung cấp mới.
4. **Nhập thông tin kết nối**:
   - Nhập **Base URL** (ví dụ: `https://api.deepseek.com/v1` hoặc `http://localhost:11434/v1`).
   - Nhập **API Key** (Key này chỉ dùng để gọi danh sách model, không lưu dưới dạng văn bản thuần túy nếu bạn đang sử dụng cơ chế bảo mật của VS Code).
   - Chọn **API Type** (`chat-completions`, `messages`, hoặc `responses`).
5. **Chọn Models**:
   - Tích chọn các model bạn muốn đưa vào VS Code Copilot Chat từ danh sách được trả về.
6. **Hoàn tất**:
   - Hệ thống sẽ tự động ghép nối cấu hình mới vào `chatLanguageModels.json`.
   - Một thông báo sẽ hiện lên xác nhận thành công và bạn có thể chọn **Open Config File** để xem và kiểm tra trực tiếp.

---

## 🛠️ Phát triển & Kiểm thử (Development & Testing)

Nếu bạn muốn đóng góp hoặc tự đóng gói extension:

```bash
# Cài đặt thư viện dependencies
npm install

# Chạy kiểm thử tự động (Unit Tests)
npm run test

# Biên dịch mã nguồn TypeScript
npm run compile

# Đóng gói thành file cài đặt .vsix
npx --yes @vscode/vsce package --allow-missing-repository --skip-license
```

---

## 📦 File cấu hình tham khảo (`chatLanguageModels.json` after setup)

Sau khi chạy extension, cấu hình trong file `chatLanguageModels.json` của bạn sẽ trông như thế này:

```json
[
  {
    "name": "DeepSeek",
    "vendor": "customendpoint",
    "apiKey": "${input:chat.lm.secret.deepseek-key}",
    "apiType": "chat-completions",
    "models": [
      {
        "id": "deepseek-chat",
        "name": "DeepSeek Chat",
        "url": "https://api.deepseek.com/v1/chat/completions",
        "toolCalling": true,
        "vision": false,
        "maxInputTokens": 64000,
        "maxOutputTokens": 4096,
        "apiType": "chat-completions"
      },
      {
        "id": "deepseek-reasoner",
        "name": "DeepSeek R1 (Reasoner)",
        "url": "https://api.deepseek.com/v1/chat/completions",
        "toolCalling": true,
        "vision": false,
        "maxInputTokens": 64000,
        "maxOutputTokens": 8192,
        "thinking": true,
        "apiType": "chat-completions"
      }
    ]
  }
]
```

## 📄 Giấy phép (License)

Sản phẩm được phát hành dưới giấy phép MIT.
