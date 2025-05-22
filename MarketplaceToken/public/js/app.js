document.addEventListener('DOMContentLoaded', () => {
    // Обработка использования скидки
    document.querySelectorAll('.use-discount').forEach(button => {
        button.addEventListener('click', async () => {
            const partnerId = button.dataset.partnerId;
            const partnerAddress = button.dataset.partnerAddress;
            const price = button.dataset.price;
            
            try {
                const response = await fetch('/use-discount', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ partnerId, partnerAddress, price })
                });
                
                const result = await response.json();
                
                if (result.success) {
                    alert(`Скидка успешно активирована! TX Hash: ${result.transactionHash}`);
                    button.disabled = true;
                    button.textContent = 'Скидка использована';
                } else {
                    alert(`Ошибка: ${result.error}`);
                }
            } catch (error) {
                console.error('Error:', error);
                alert('Произошла ошибка при обработке запроса');
            }
        });
    });
    
    // Обработка сдачи отходов
    document.querySelectorAll('.recycle-btn').forEach(button => {
        button.addEventListener('click', async () => {
            const pointId = button.dataset.pointId;
            
            try {
                const response = await fetch('/recycle', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ pointId })
                });
                
                const result = await response.json();
                
                if (result.success) {
                    alert(`Вы получили ${result.amount} MDT за сдачу отходов!`);
                } else {
                    alert(`Ошибка: ${result.error}`);
                }
            } catch (error) {
                console.error('Error:', error);
                alert('Произошла ошибка при обработке запроса');
            }
        });
    });
});