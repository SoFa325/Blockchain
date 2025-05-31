from flask import Flask, request, jsonify
import pandas as pd
import xgboost as xgb

app = Flask(__name__)

# Загрузка модели
model = xgb.XGBRegressor()
model.load_model('xgboost_model.json')

@app.route('/predict', methods=['POST'])
def predict():
    data = request.json
    features = pd.DataFrame([{
        'recycle_actions': data['recycle_actions'],
        'purchases': data['purchases'],
        'items_recycled': data['items_recycled'],
        'partner_diversity': data['partner_diversity']
    }])
    
    # Предсказание eco-score
    eco_score = model.predict(features)[0]
    
    # Генерация рекомендаций
    recommendations = generate_recommendations(features.iloc[0])
    
    return jsonify({
        'eco_score': int(round(eco_score)),
        'recommendations': recommendations
    })

def generate_recommendations(features):
    recs = []
    
    if features['recycle_actions'] < 15:
        recs.append("Увеличьте количество посещений пунктов сдачи отходов. Старайтесь сдавать отходы хотя бы 2 раза в месяц.")
    
    if features['items_recycled'] < 50:
        recs.append("Попробуйте сдавать больше единиц отходов за один раз. Начните собирать пластик и бумагу отдельно.")
    
    if features['partner_diversity'] < 3:
        recs.append("Используйте бонусы у разных партнеров. Это не только экономит токены, но и помогает экологии.")
    
    if features['purchases'] > 20:
        recs.append("Сбалансируйте использование токенов между покупками и экодействиями. Помните, что экология важнее!")
    
    if not recs:
        recs.append("Ваш эко-профиль отличный! Продолжайте в том же духе и делитесь опытом с друзьями.")
    
    return recs

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)