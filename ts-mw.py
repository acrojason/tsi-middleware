# ts-mw.py
import json
import os
from flask import Flask, request, jsonify
from flask_cors import CORS
from datetime import datetime

# Load character data
PC_FILE = 'pc.json'
SKILL_TABLE_FILE = 'skill_table.json'

def load_pc_data():
    if not os.path.exists(PC_FILE):
        print(f"Warning: {PC_FILE} not found")
        return None

    with open(PC_FILE, 'r') as f:
        data = json.load(f)
        if isinstance(data, list) and len(data) > 0:
            return data[0]
        return data

def load_skill_table():
    if not os.path.exists(SKILL_TABLE_FILE):
        print(f"Warning: {SKILL_TABLE_FILE} not found")
        return {}
    with open(SKILL_TABLE_FILE, 'r') as f:
        return json.load(f)
        
PC_DATA = load_pc_data()
SKILL_TABLE = load_skill_table()

def find_skill_in_table(skill_name):
    """Recursively search skill table for skill definition"""
    def search_dict(d):
        for key, value in d.items():
            if key == skill_name:
                return value
            if isinstance(value, dict):
                result = search_dict(value)
                if result:
                    return result
        return None
    return search_dict(SKILL_TABLE)

def get_attribute_value(pc_data, attribute_name):
    """Get attribute value by name"""
    attrs = pc_data.get('attributes', {})
    return attrs.get(attribute_name, 50)

def get_character_advantages(pc_data):
    """Get dict of character's active advantages with their levels"""
    advantages_dict = pc_data.get('advantagesDisadvantages', {}).get('advantages', {})
    # Return only advantages with level > 0
    return {name: level for name, level in advantages_dict.items() if level > 0}

def calculate_advantage_modifiers(pc_data, skill_name, skill_def, skill_level):
    """Calculate modifiers from advantages based on skill_table definitions"""
    flat_bonus = 0
    progression_bonus = 0
    
    # Get character's advantages
    char_advantages = get_character_advantages(pc_data)
    
    # Check if skill has advantageModifier section
    advantage_mods = skill_def.get('advantageModifier', {})
    
    for advantage_name, modifier_data in advantage_mods.items():
        # Check if character has this advantage (exact name match)
        if advantage_name in char_advantages:
            adv_level = char_advantages[advantage_name]
            
            # Apply flat bonus (added once to base threshold)
            if 'flatBonus' in modifier_data:
                bonus = modifier_data['flatBonus']
                flat_bonus += bonus
                print(f"[ADVANTAGE] {advantage_name}: +{bonus} flat to {skill_name}")
            
            # Apply progression bonus (adds to progression rate per skill level)
            if 'progressionBonus' in modifier_data:
                bonus = modifier_data['progressionBonus']
                progression_bonus += bonus
                print(f"[ADVANTAGE] {advantage_name}: +{bonus} progression to {skill_name}")
    
    return flat_bonus, progression_bonus
    
def calculate_skill_threshold(pc_data, skill_name):
    """Calculate base threshold for a skill"""
    
    # Check if skill exists in PC's skill list
    pc_skills = pc_data.get('skills', {})
    skill_level = pc_skills.get(skill_name, None)

    # Get skill definition from skill table
    skill_def = find_skill_in_table(skill_name)

    if not skill_def:
        print(f"Warning: Skill '{skill_name}' not found in skill table")
        return 50

    # Get governing attribute
    attribute = skill_def.get('attribute')
    if isinstance(attribute, list):
        # Some skills can use multiple attributes
        # Use the highest attribute value
        attribute_value = max(get_attribute_value(pc_data, attr) for attr in attribute)
    else:
        attribute_value = get_attribute_value(pc_data, attribute)

    # Calculate threshold
    if skill_level is None or skill_level == 0:
        # Untrained - use attribute * untrained factor
        untrained_factor = skill_def.get('untrainedFactor', 0.25)
        base_threshold = int(attribute_value * untrained_factor)
        # No advantage bonuses for untrained skills
    else:
        # Trained: attribute + (level * (baseProgression + advantageProgression)) + flatBonus
        base_progression_rate = skill_def.get('progressionRate', 5)

        # Get advantage modifiers
        flat_bonus, progression_bonus = calculate_advantage_modifiers(
            pc_data, skill_name, skill_def, skill_level
        )

        total_progression = base_progression_rate + progression_bonus

        # Calculate threshold
        base_threshold = attribute_value + (skill_level * total_progression) + flat_bonus

    # Clamp between 5 and 95
    base_threshold = max(5, min(95, base_threshold))
    return base_threshold

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=False)

@app.route("/pc.json", methods=["GET"])
def get_pc():
    """Serve the PC data with calculated skill thresholds"""
    if PC_DATA is None:
        return jsonify({"error": "Character data not loaded"}), 500
    
    # Build enhanced PC data with calculated thresholds
    enhanced_pc = dict(PC_DATA)
    enhanced_pc['calculated_skills'] = {}
    
    for skill_name in PC_DATA.get('skills', {}).keys():
        threshold = calculate_skill_threshold(PC_DATA, skill_name)
        skill_def = find_skill_in_table(skill_name)
        
        enhanced_pc['calculated_skills'][skill_name] = {
            'base': threshold,
            'level': PC_DATA['skills'][skill_name],
            'attribute': skill_def.get('attribute') if skill_def else 'Unknown'
        }
    
    return jsonify([enhanced_pc])
    
@app.route("/check", methods=["POST", "OPTIONS"])
def check():
    if request.method == "OPTIONS":
        return ("", 200)

    data = request.get_json(force=True)
    skill_name = data.get("skill", "Unknown")
    roll = int(data.get("roll", -1))
    modifier = int(data.get("modifier", 0))

    if PC_DATA is None:
        return jsonify({"ok": False, "error": "Character data not loaded"}), 500

    # Calculate base threshold (includes advantage modifiers from skill table)
    base_threshold = calculate_skill_threshold(PC_DATA, skill_name)
    
    # Apply situational modifier from difficulty
    final_threshold = max(5, min(95, base_threshold + modifier))
    
    character_name = PC_DATA.get("name", "Unknown")
    
    success = roll <= final_threshold
    margin = abs(final_threshold - roll)

    # Quality determination
    if roll <= 4:
        quality = "critical_success"
        quality_text = "CRITICAL SUCCESS"
    elif roll >= 95:
        quality = "critical_failure"
        quality_text = "CRITICAL FAILURE"
    elif success and margin >= 20:
        quality = "excellent"
        quality_text = "Excellent success"
    elif success:
        quality = "normal"
        quality_text = "Success"
    elif margin >= 20:
        quality = "terrible"
        quality_text = "Terrible failure"
    else:
        quality = "failure"
        quality_text = "Failure"

    details = (f"{character_name} attempted {skill_name}: "
               f"rolled {roll} vs {final_threshold}% "
               f"(base {base_threshold}, situation {modifier:+d}) - {quality_text}")

    return jsonify({
        "type": "check_result",
        "ok": True,
        "success": success,
        "margin": margin,
        "quality": quality,
        "threshold": final_threshold,
        "base_threshold": base_threshold,
        "situational_modifier": modifier,
        "details": details,
        "stamp": datetime.utcnow().isoformat()
    })

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5050, debug=True)
