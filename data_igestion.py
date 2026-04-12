# -------------------------This script is to insert the PDFs into the MongoDB 'resumes' collection----------------------------#

import pymongo
import os
from dotenv import load_dotenv # Use python-dotenv to load .env file
from bson.binary import Binary  # To store the PDF as binary data

# --- 1. Load Environment Variables ---
load_dotenv() # Load variables from .env file (needs python-dotenv installed)
MONGO_URI = os.getenv("MONGO_URI")

if not MONGO_URI:
    raise RuntimeError("MONGO_URI not found in .env file! Please create a .env file with your MongoDB connection string.")

# --- 2. Connect to MongoDB ---
try:
    client = pymongo.MongoClient(MONGO_URI)
    # Ping the server to confirm connection
    client.admin.command('ping')
    print("✅ Connected to MongoDB successfully!")
except Exception as e:
    print(f"❌ Failed to connect to MongoDB. Check your MONGO_URI in the .env file.")
    print(f"Error: {e}")
    raise

# Create/select your database and collection
db = client['ats_db']
collection = db['resumes'] # This script populates the 'resumes' collection

# --- 3. Define the folder where your resumes are stored ---

resumes_folder_path = './resume_pdfs/' # idhar ayega path 
if not os.path.exists(resumes_folder_path):
    print(f"❌ Error: The path '{resumes_folder_path}' does not exist.")
    print("Please create the folder or update the 'resumes_folder_path' variable in this script.")
    raise FileNotFoundError

print(f"Scanning for resumes in: {resumes_folder_path}")

# --- 4. Loop, Read, and Insert ---
inserted_count = 0
skipped_count = 0
failed_count = 0

for filename in os.listdir(resumes_folder_path):
    if filename.endswith('.pdf'):
        file_path = os.path.join(resumes_folder_path, filename)

        # Check if this file is already in the DB
        if collection.find_one({"filename": filename}):
            # print(f"ℹ️ Skipped: '{filename}' already exists in the database.") # Optional: uncomment for verbose skipping
            skipped_count += 1
            continue

        try:
            # Read the PDF file as binary data
            with open(file_path, 'rb') as f:
                pdf_data = f.read()

            # Create the document to insert
            resume_document = {
                "filename": filename,
                "file_data": Binary(pdf_data)  # Store the binary data
            }

            # Insert the document
            collection.insert_one(resume_document)
            print(f"✅ Successfully inserted: '{filename}'")
            inserted_count += 1

        except Exception as e:
            print(f"❌ Failed to insert '{filename}': {e}")
            failed_count += 1

print("\n--- PDF Ingestion Complete! ---")
print(f"Inserted: {inserted_count}")
print(f"Skipped (already exist): {skipped_count}")
print(f"Failed: {failed_count}")
client.close()
print("MongoDB connection closed.")

#---------This script makes chunks, generates vectors, and adds them to the MongoDB 'resume_chunks' collection.----------#

import pymongo
import io
import pdfplumber
import os
from dotenv import load_dotenv
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings

# --- 1. Load Environment Variables ---
load_dotenv() # Load variables from .env file (needs python-dotenv installed)
MONGO_URI = os.getenv("MONGO_URI")

if not MONGO_URI:
    raise RuntimeError("MONGO_URI not found in .env file!")

# --- 2. Connect to MongoDB ---
try:
    client = pymongo.MongoClient(MONGO_URI)
    client.admin.command('ping') # Test connection
    db = client['ats_db']
    pdf_collection = db['resumes']        # Collection with original PDFs
    chunk_collection = db['resume_chunks'] # Collection for chunks and vectors
    print("✅ Connected to MongoDB successfully.")
except Exception as e:
    print(f"❌ Failed to connect to MongoDB. Check your MONGO_URI in the .env file.")
    print(f"Error: {e}")
    raise

# --- 3. Initialize Models ---
try:
    print("Loading embedding model (intfloat/e5-base)... This might take a moment.")
    model_name = "intfloat/e5-base"
    embedding_model = HuggingFaceEmbeddings(model_name=model_name)

    # Use the larger chunk size for better context
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=150,
        length_function=len
    )
    print("✅ Models initialized.")
except Exception as e:
    print(f"❌ Failed to initialize models: {e}")
    raise

# --- 4. Process PDFs and Upload Chunks + Vectors ---
try:
    # Clear the collection first to avoid duplicates if re-running
    print("Clearing old chunks from 'resume_chunks'...")
    delete_result = chunk_collection.delete_many({})
    print(f"  Deleted {delete_result.deleted_count} old documents.")

    print("Processing PDFs from 'resumes' collection...")
    resumes_to_process = list(pdf_collection.find()) # Fetch all PDFs from the DB
    total_resumes = len(resumes_to_process)

    if total_resumes == 0:
        print("⚠️ No resumes found in the 'resumes' collection. Run the first ingestion script ('ingest_data.py') first.")
    else:
        print(f"Found {total_resumes} resumes.")

    total_chunks_inserted = 0
    failed_resumes = []

    for i, doc in enumerate(resumes_to_process):
        filename = doc.get('filename', f'Unknown_Doc_{i+1}') # Use .get for safety
        resume_binary = doc.get('file_data')

        if not resume_binary:
            print(f"[{i+1}/{total_resumes}] ⚠️ Skipping: '{filename}' has no binary data.")
            failed_resumes.append(filename)
            continue

        print(f"[{i+1}/{total_resumes}] Processing: {filename}")

        try:
            # Extract text
            full_text = ""
            with io.BytesIO(resume_binary) as f:
                with pdfplumber.open(f) as pdf:
                    for page in pdf.pages:
                        page_text = page.extract_text()
                        if page_text: # Ensure text was extracted
                            full_text += page_text + "\n"

            if not full_text.strip():
                print(f"  ⚠️ Warning: No text extracted from '{filename}'. It might be image-based or corrupted.")
                continue # Skip if no text

            # Split the text
            chunks = text_splitter.split_text(full_text)
            if not chunks:
                 print(f"  ⚠️ Warning: Text splitting resulted in 0 chunks for '{filename}'.")
                 continue

            # --- Generate embeddings for all chunks ---
            embeddings = embedding_model.embed_documents(chunks)

            # Prepare documents for bulk insertion
            documents_to_insert = []
            for j, chunk_text in enumerate(chunks):
                documents_to_insert.append({
                    "source": filename,       # Metadata: which resume?
                    "text": chunk_text,       # The actual text chunk
                    "embedding": embeddings[j] # The vector for this chunk
                })

            # Insert all chunks for this resume in one go
            if documents_to_insert:
                result = chunk_collection.insert_many(documents_to_insert)
                inserted_count = len(result.inserted_ids)
                total_chunks_inserted += inserted_count
                print(f"  ✅ Inserted {inserted_count} chunks for {filename}")

        except Exception as e:
            print(f"  ❌ Error processing '{filename}': {e}")
            failed_resumes.append(filename)

except Exception as e:
    print(f"❌ An unexpected error occurred during the main processing loop: {e}")
finally:
    client.close() # Ensure connection is closed even if errors occur

print("\n--- Chunk & Vector Ingestion Complete! ---")
print(f"Total chunks inserted into 'resume_chunks': {total_chunks_inserted}")
if failed_resumes:
    print(f"Resumes that failed during processing: {len(failed_resumes)}")
    # print("Failed filenames:", failed_resumes) # Optional: uncomment to list failed files
print("MongoDB connection closed.")