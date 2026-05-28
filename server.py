import os
import faiss
import numpy as np
import pdfplumber
import google.generativeai as genai
from flask import Flask, request, jsonify, render_template, session, Response, stream_with_context
from sentence_transformers import SentenceTransformer
from dotenv import load_dotenv
import uuid

load_dotenv()

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
genai.configure(api_key=GEMINI_API_KEY)
model = genai.GenerativeModel(model_name="gemini-2.5-flash")

SYSTEM_PROMPT = """You are CareerMentor AI, an expert career coach.

Your responsibilities:
- Resume Review & ATS Analysis
- Career Roadmaps & Planning
- Mock Interviews & Interview Prep
- Skill Gap Analysis
- Project Suggestions
- Cover Letter Writing
- Career Guidance

Communication Style:
- Professional yet friendly
- Practical and actionable
- Structured with clear sections
- Concise but thorough

Format responses with clear sections using markdown-style formatting."""

embedding_model = SentenceTransformer("all-MiniLM-L6-v2")

documents = []
document_embeddings = None


def extract_text_from_pdf(pdf_path):
    if pdf_path is None:
        return ""
    text = ""
    try:
        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    text += page_text + "\n"
    except Exception as e:
        return f"PDF Error: {str(e)}"
    return text


def split_text(text, chunk_size=500):
    chunks = []
    for i in range(0, len(text), chunk_size):
        chunks.append(text[i:i + chunk_size])
    return chunks


def load_documents(folder_path="data"):
    global documents
    if not os.path.exists(folder_path):
        return
    for file in os.listdir(folder_path):
        if file.endswith(".pdf"):
            full_path = os.path.join(folder_path, file)
            text = extract_text_from_pdf(full_path)
            chunks = split_text(text)
            documents.extend(chunks)


def create_vector_store():
    global document_embeddings
    if not documents:
        return
    embeddings = embedding_model.encode(documents)
    dimension = embeddings.shape[1]
    index = faiss.IndexFlatL2(dimension)
    index.add(np.array(embeddings))
    document_embeddings = index


def search_documents(query, top_k=3):
    if document_embeddings is None or not documents:
        return ""
    query_embedding = embedding_model.encode([query])
    distances, indices = document_embeddings.search(np.array(query_embedding), top_k)
    results = []
    for idx in indices[0]:
        if idx < len(documents):
            results.append(documents[idx])
    return "\n".join(results)


os.makedirs("data", exist_ok=True)
load_documents()
create_vector_store()

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "careermentor-secret-2024")

chat_histories = {}


@app.route("/")
def index():
    if "session_id" not in session:
        session["session_id"] = str(uuid.uuid4())
    return render_template("index.html")


def build_prompt(user_message, mode, history):
    retrieved_context = search_documents(user_message)

    conversation_history = ""
    for msg in history[-6:]:
        conversation_history += f"User: {msg['user']}\nAssistant: {msg['assistant']}\n"

    mode_instructions = {
        "ats":    "Focus on ATS optimization, resume scoring (out of 100), keyword analysis, and formatting improvements.",
        "coach":  "Act as a career coach. Provide roadmaps, skill development plans, and career trajectory advice.",
        "cover":  "Help write or improve cover letters. Be specific, compelling, and tailored.",
        "resume": "Focus on resume improvement, bullet point strengthening, and professional presentation.",
        "skills": "Analyze skill gaps, suggest learning resources, and provide upskilling roadmaps."
    }
    mode_note = mode_instructions.get(mode, "")

    return (
        SYSTEM_PROMPT + "\n\n"
        + (f"Special focus for this session: {mode_note}\n\n" if mode_note else "")
        + (f"Relevant Career Knowledge:\n{retrieved_context}\n\n" if retrieved_context else "")
        + (f"Conversation History:\n{conversation_history}\n" if conversation_history else "")
        + f"User: {user_message}\n\nAssistant:"
    )


@app.route("/api/chat/stream", methods=["POST"])
def chat_stream():
    import json
    data = request.json
    user_message = data.get("message", "").strip()
    mode = data.get("mode", "chat")
    session_id = session.get("session_id", "default")

    if not user_message:
        return jsonify({"error": "Empty message"}), 400

    if session_id not in chat_histories:
        chat_histories[session_id] = []

    history = chat_histories[session_id]
    final_prompt = build_prompt(user_message, mode, history)

    def generate():
        full_reply = ""
        try:
            stream = model.generate_content(final_prompt, stream=True)
            for chunk in stream:
                try:
                    text = chunk.text
                except Exception:
                    continue
                if text:
                    full_reply += text
                    payload = json.dumps({"chunk": text})
                    yield f"data: {payload}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'chunk': f'❌ Error: {str(e)}'})}\n\n"
        finally:
            # Save to history after full reply is assembled
            history.append({"user": user_message, "assistant": full_reply})
            chat_histories[session_id] = history[-20:]
            yield "data: [DONE]\n\n"

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no"
        }
    )


@app.route("/api/chat", methods=["POST"])
def chat():
    import json
    data = request.json
    user_message = data.get("message", "").strip()
    mode = data.get("mode", "chat")
    session_id = session.get("session_id", "default")

    if not user_message:
        return jsonify({"error": "Empty message"}), 400

    if session_id not in chat_histories:
        chat_histories[session_id] = []

    history = chat_histories[session_id]
    final_prompt = build_prompt(user_message, mode, history)

    try:
        response = model.generate_content(final_prompt)
        reply = response.text
        history.append({"user": user_message, "assistant": reply})
        chat_histories[session_id] = history[-20:]
        return jsonify({"reply": reply})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/upload", methods=["POST"])
def upload_resume():
    if "file" not in request.files:
        return jsonify({"error": "No file"}), 400

    file = request.files["file"]
    if not file.filename.endswith(".pdf"):
        return jsonify({"error": "Only PDF files supported"}), 400

    import tempfile
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        file.save(tmp.name)
        text = extract_text_from_pdf(tmp.name)
        os.unlink(tmp.name)

    if not text or text.startswith("PDF Error"):
        return jsonify({"error": "Could not extract text from PDF"}), 400

    return jsonify({"text": text, "preview": text[:300] + "..." if len(text) > 300 else text})


@app.route("/api/export", methods=["GET"])
def export_chat():
    from datetime import datetime
    session_id = session.get("session_id", "default")
    history = chat_histories.get(session_id, [])

    if not history:
        return jsonify({"error": "No conversation to export"}), 400

    lines = []
    lines.append("=" * 60)
    lines.append("  CareerMentor AI — Conversation Export")
    lines.append(f"  {datetime.now().strftime('%B %d, %Y at %I:%M %p')}")
    lines.append("=" * 60)
    lines.append("")

    for i, msg in enumerate(history, 1):
        lines.append(f"[{i}] You:")
        lines.append(f"    {msg['user']}")
        lines.append("")
        lines.append(f"[{i}] CareerMentor AI:")
        for para in msg["assistant"].split("\n"):
            lines.append(f"    {para}")
        lines.append("")
        lines.append("-" * 60)
        lines.append("")

    lines.append("=" * 60)
    lines.append("  Exported from CareerMentor AI")
    lines.append("=" * 60)

    content = "\n".join(lines)
    filename = f"careermentor_chat_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"

    return Response(
        content,
        mimetype="text/plain",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


@app.route("/api/reset", methods=["POST"])
def reset():
    session_id = session.get("session_id", "default")
    if session_id in chat_histories:
        chat_histories[session_id] = []
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
