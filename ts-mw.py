# middleware.py
import json
import os
from flask import Flask, request, jsonify
from flask_cors import CORS
from datetime import datetime

# Load character data
PC_FILE = 'pc.json'

def load_pc_data():
    # Load the player character data from pc.json
    if not os.path.exists(PC_FILE):
        print(f"Warning: {PC_FILE} not found")
        return None

    with open(PC_FILE, 'r') as f:
        data = json.load (f)
        # pc.json contains an array, get first character
        if isinstance(data, list) and len(data) > 0:
            return data[0]
        return data

PC_DATA = load_pc_data()

app = Flask(__name__)
# allow all origins for quick local testing; tighten later if you want
CORS(app, resources={r"/check": {"origins": "*"}}, supports_credentials=False)

@app.route("/check", methods=["POST", "OPTIONS"])
def check():
    if request.method == "OPTIONS":
        # Flask-CORS will add the headers; a 200 here is fine
        return ("", 200)

    data = request.get_json(force=True)

    # Get skill and roll from request
    skill_name = data.get("skill", "Unknown")
    roll = int(data.get("roll", -1))

    if PC_DATA is None:
        return jsonify({"ok": False, "error": "Character data not loaded"}), 500

    skill_data = PC_DATA.get("skills", {}).get(skill_name)
    if not skill_data:
        return jsonify({"ok": False, "error": f"Skill {skill_name} not found on character"}), 400

    # Calculate threshold: base + {level *5}
    # Assuming skill_data is like: {"level": 0, "base": 45}
    if isinstance(skill_data, dict):
        base = skill_data.get("base", 0)
        level = skill_data.get("level", 0)
        threshold = base + (level * 5)
    else:
        # Fallback for old format where skill is just a number
        threshold = int(skill_data)

    # Apply modifier from frontend (situational difficulty)
    modifier = int(data.get("modifier", 0))
    threshold = max(0, min(100, threshold + modifier))
    
    characther_name = PC_DATA.get("name", "Unknown")
    
    success = roll <= threshold
    margin = abs(threshold - roll)

    if roll <= 4:
        quality = "crit"
    elif roll >= 95:
        quality = "fumble"
    else:
        quality = "normal"

    details = f"{character} attempted {skill} with a roll of {roll} vs {threshold}."

    return jsonify({
        "type": "check_result",
        "ok": True,
        "success": success,
        "margin": margin,
        "quality": quality,
        "details": details,
        "stamp": datetime.utcnow().isoformat()
    })

if __name__ == "__main__":
    # choose your port; 5050 matches your ST config
    app.run(host="127.0.0.1", port=5050)

