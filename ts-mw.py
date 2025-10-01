# middleware.py
from flask import Flask, request, jsonify
from flask_cors import CORS
from datetime import datetime

app = Flask(__name__)
# allow all origins for quick local testing; tighten later if you want
CORS(app, resources={r"/check": {"origins": "*"}}, supports_credentials=False)

@app.route("/check", methods=["POST", "OPTIONS"])
def check():
    if request.method == "OPTIONS":
        # Flask-CORS will add the headers; a 200 here is fine
        return ("", 200)

    data = request.get_json(force=True)
    character = data.get("character", "Unknown")
    skill = data.get("skill", "Unknown")
    threshold = int(data.get("threshold", 0))
    roll = int(data.get("roll", 0))

    success = roll <= threshold
    margin = abs(threshold - roll)

    if roll <= 5:
        quality = "crit"
    elif roll >= 96:
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

