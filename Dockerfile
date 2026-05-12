FROM node:18-slim

# System deps: Python, ffmpeg, build tools for whisper/torch
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    ffmpeg \
    git \
    && rm -rf /var/lib/apt/lists/*

# Symlink python → python3 so spawn('python') works too
RUN ln -sf /usr/bin/python3 /usr/bin/python

# Install Python packages into a venv to avoid pip system conflict
RUN python3 -m venv /opt/pyenv
ENV PATH="/opt/pyenv/bin:$PATH"

# yt-dlp + google-genai are small; whisper pulls torch (~2 GB) — install last
COPY Context_extraction/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

WORKDIR /app

# Node deps first (layer cache)
COPY package*.json ./
RUN npm ci --omit=dev

# App source
COPY . .

EXPOSE 8080

CMD ["node", "src/index.js"]
