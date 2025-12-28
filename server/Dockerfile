# Use a lightweight Python version
FROM python:3.9-slim

# Install system dependencies (Required for file detection on Linux)
RUN apt-get update && apt-get install -y libmagic1

# Set work directory
WORKDIR /app

# Copy requirements and install Python libraries
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application code
COPY . .

# Run the application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "10000"]