import os
import io
import pymongo
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from contextlib import asynccontextmanager
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from langchain_mongodb import MongoDBAtlasVectorSearch
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough
from dotenv import load_dotenv
load_dotenv()
app_state = {}

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Startup: Loading models and connecting to DB...")
    
    # 1. Get API Keys from environment variables
    GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
    MONGO_URI = os.getenv("MONGO_URI")
    os.environ["GOOGLE_API_KEY"] = GOOGLE_API_KEY
    
    if not GOOGLE_API_KEY or not MONGO_URI:
        raise RuntimeError("API keys (GOOGLE_API_KEY, MONGO_URI) not found in env file (🔑)!")

    # 2. Connect to MongoDB
    app_state["mongo_client"] = pymongo.MongoClient(MONGO_URI)
    db = app_state["mongo_client"]['ats_db']
    chunk_collection = db['resume_chunks']
    pdf_collection = db['resumes']
    app_state["pdf_collection"] = pdf_collection
    print("Connected to MongoDB.")

    # 3. Initialize Embedding Model
    model_name = "intfloat/e5-base"
    embedding_model = HuggingFaceEmbeddings(model_name=model_name)
    print("Embedding model loaded.")

    # 4. Initialize Vector Store and Retriever
    vector_store = MongoDBAtlasVectorSearch(
        collection=chunk_collection,
        embedding=embedding_model,
        index_name="vector_index"
    )
    app_state["retriever"] = vector_store.as_retriever(
        search_type='similarity', 
        search_kwargs={"k": 10}
    )
    print("Vector retriever is ready.")

    # 5. Initialize LLM
    app_state["llm"] = ChatGoogleGenerativeAI(model="gemini-2.5-flash")
    
    # 6. Define Prompt and RAG Chain
    template = """
    You are an expert Hiring Manager. Use the context to answer the question. 
    Each piece of context has a 'source' field (the filename).
    When answering, state which candidate or resume your information comes from.
    If you don't know the answer, just say "I cannot find information about this in the provided resumes." DO NOT LIE.

    Context: {context}
    Question: {question}
    Answer:
    """
    prompt = PromptTemplate.from_template(template)
    parser = StrOutputParser()
    
    app_state["main_chain"] = (
        {"context": app_state["retriever"], "question": RunnablePassthrough()} 
        | prompt 
        | app_state["llm"] 
        | parser
    )
    print("✅ RAG chain is built. Application is ready!")
    
    yield 

    print("Shutdown: Closing MongoDB connection...")
    app_state["mongo_client"].close()

# Create the FastAPI app
app = FastAPI(lifespan=lifespan)

# Define request/response models
class QueryRequest(BaseModel):
    question: str

class QueryResponse(BaseModel):
    answer_text: str
    source_files: list[str]

# --- API ENDPOINTS ---

@app.post("/query", response_model=QueryResponse)
async def handle_query(request: QueryRequest):
    question = request.question
    try:
        docs = await app_state["retriever"].ainvoke(question)
        source_files = list(set(doc.metadata.get("source") for doc in docs if doc.metadata.get("source")))
        answer = await app_state["main_chain"].ainvoke(question) 
        
        return QueryResponse(
            answer_text=answer,
            source_files=source_files
        )
    except Exception as e:
        print(f"--- ❌ CRITICAL ERROR IN /query ---")
        print(e)
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")

@app.get("/get_pdf/{filename}")
async def get_pdf(filename: str):
    try:
        pdf_doc = app_state["pdf_collection"].find_one({"filename": filename})
        if not pdf_doc:
            raise HTTPException(status_code=404, detail="PDF not found")
        
        pdf_binary = pdf_doc['file_data']
        return StreamingResponse(
            io.BytesIO(pdf_binary),
            media_type="application/pdf",
            headers={"Content-Disposition": f"inline; filename={filename}"}
        )
    except Exception as e:
        print(f"Error retrieving PDF: {e}")
        raise HTTPException(status_code=500, detail="Error retrieving PDF")

# --- FRONTEND ENDPOINTS ---

# This endpoint serves the login HTML page as the default
@app.get("/")
async def get_login_page():
    return FileResponse("static/login.html")

# This endpoint serves your main chat HTML page
@app.get("/chat")
async def get_index():
    return FileResponse("static/index.html")

# This mounts the 'static' directory, making style.css, script.js, login.css, login.js available
app.mount("/static", StaticFiles(directory="static"), name="static")