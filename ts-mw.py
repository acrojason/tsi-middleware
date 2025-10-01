from flask import Flask, request, jsonify
from datetime import datetime

app = Flask(__name__)

@app.route("/check", methods=["POST"])
def check():
    data = request.get_json(force=True)
    character = data.get("character", "Unknown")
    skill = data.get("skill", "Unknown")
    threshold = int(data.get("threshold", 0))
    roll = int(data.get("roll", 0))

    success = roll <= threshold
    margin = abs(threshold - roll)

    # crude quality rule
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
    app.run(host="0.0.0.0", port=5050)
