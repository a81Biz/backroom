FROM python:3.9-slim

WORKDIR /app

# Install system dependencies required for OpenCV and other libs
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    poppler-utils \
    libsm6 \
    libxext6 \
    libxrender-dev \
    git \
    tesseract-ocr \
    libtesseract-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first to leverage Docker cache
COPY requirements.txt .

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application
COPY . .

# Environment variable to ensure output is flushed immediately
ENV PYTHONUNBUFFERED=1

# Command to run the processor
CMD ["python", "processor.py"]
