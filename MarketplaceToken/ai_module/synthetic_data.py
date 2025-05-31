import pandas as pd
import numpy as np
import uuid

def generate_synthetic_data(num_users=1000):
    data = []
    for _ in range(num_users):
        recycle_actions = np.random.randint(0, 20)
        purchases = np.random.randint(0, 20)
        items_recycled = np.random.randint(0, 70)
        partner_diversity = np.random.randint(1, 10)
        
        # Формула для расчета базового eco-score
        base_score = (
            1.5 * recycle_actions +
            1.0 * np.log1p(items_recycled) * 10 +  # Увеличиваем влияние логарифма
            2.0 * partner_diversity -
            0.7 * purchases
        )
        
        # Нормализация к диапазону 1-100
        # Сначала ограничиваем базовый счет
        base_score = np.clip(base_score, 10, 100)
        
        # Преобразуем в 0-1 диапазон
        normalized_score = (base_score - 10) / 90
        
        # Добавляем шум и преобразуем обратно в 1-100
        eco_score = 1 + 99 * (normalized_score + np.random.normal(0, 0.1))
        
        # Гарантируем границы
        eco_score = np.clip(eco_score, 1, 100)
        
        data.append({
            'user_id': str(uuid.uuid4()),
            'recycle_actions': recycle_actions,
            'purchases': purchases,
            'items_recycled': items_recycled,
            'partner_diversity': partner_diversity,
            'eco_score': eco_score
        })
    
    return pd.DataFrame(data)

if __name__ == "__main__":
    df = generate_synthetic_data()
    df.to_csv('synthetic_data.csv', index=False)
    print(f"Сгенерировано {len(df)} записей. Данные сохранены в synthetic_data.csv")
    
    # Проверка диапазона
    min_score = df['eco_score'].min()
    max_score = df['eco_score'].max()
    print(f"Eco-score диапазон: {min_score:.2f} - {max_score:.2f}")
    
    # Проверка распределения
    print("\nРаспределение eco-score:")
    for i in range(1, 11):
        lower = (i-1)*10
        upper = i*10
        count = df[(df['eco_score'] >= lower) & (df['eco_score'] < upper)].shape[0]
        print(f"{lower}-{upper}: {count} записей")