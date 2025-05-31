import pandas as pd
import xgboost as xgb
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error

def train_model():
    # Загрузка синтетических данных
    df = pd.read_csv('synthetic_data.csv')
    
    # Подготовка данных
    X = df.drop(['user_id', 'eco_score'], axis=1)
    y = df['eco_score'].astype(int)
    
    # Разделение данных
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42
    )
    
    # Обучение модели
    model = xgb.XGBRegressor(
        objective='reg:squarederror',
        n_estimators=100,
        max_depth=5,
        learning_rate=0.1
    )
    model.fit(X_train, y_train)
    
    # Оценка модели
    y_pred = model.predict(X_test)
    mae = mean_absolute_error(y_test, y_pred)
    print(f"Model MAE: {mae:.2f}")
    
    # Сохранение модели
    model.save_model('xgboost_model.json')
    
    return model

if __name__ == "__main__":
    train_model()