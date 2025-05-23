
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const { Web3 } = require('web3');
const path = require('path');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
require('dotenv').config();

const fs = require('fs').promises;

const USERS_FILE = path.join(__dirname, 'users.json');
const PURCHASES_FILE = path.join(__dirname, 'purchases.json');

async function readData(filePath) {
    try {
        const data = await fs.readFile(filePath, 'utf8');
        return data ? JSON.parse(data) : [];
    } catch (err) {
        if (err.code === 'ENOENT') {
            // Если файл не существует, создаем его с пустым массивом
            await writeData(filePath, []);
            return [];
        }
        console.error(`Ошибка чтения файла ${filePath}:`, err);
        return [];
    }
}

async function writeData(filePath, data) {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

const app = express();
const port = process.env.PORT || 3000;

const web3 = new Web3(process.env.PROVIDER_URL || 'http://localhost:7545');
const contractArtifact = require('./build/contracts/MarketplaceToken.json');
const contractAbi = contractArtifact.abi;
const contractAddress = contractArtifact.networks[Object.keys(contractArtifact.networks)[0]].address;
const marketplaceToken = new web3.eth.Contract(contractAbi, contractAddress);

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false, 
    cookie: { 
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000 // 1 день
    }
}));


let users = [];


app.use(express.static(path.join(__dirname, 'public')));
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

let availableAccounts = [];

async function initAccounts() {
    try {
        const accounts = await web3.eth.getAccounts();
        availableAccounts = accounts; 
        console.log(`Доступно ${availableAccounts.length} аккаунтов для пользователей`);
    } catch (error) {
        console.error('Ошибка инициализации аккаунтов:', error);
        process.exit(1);
    }
}

async function sendAccountEmail(email, account) {
    const loginUrl = `http://localhost:${port}/auth`;
    const pass = process.env.Password;
    try {
        const transporter = nodemailer.createTransport({
            host: 'smtp.mail.ru',
            port: 465,
            secure: true,
            auth: {
                user: 'sofyabel@inbox.ru',
                pass: pass
            }
        });
        let result = await transporter.sendMail({
            from: `"Blockchain Service" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: 'Ваш блокчейн-аккаунт',
            html: `
                <h2>Регистрация завершена</h2>
                <p>Вам был выделен следующий блокчейн-аккаунт:</p>
                <p><strong>Адрес аккаунта:</strong> ${account}</p>
                <p>Теперь вы можете <a href="${loginUrl}">войти в систему</a>.</p>
                <p>Этот аккаунт будет привязан к вашей почте ${email}.</p>
            `
        });
        console.log(result);
        return true;
    } catch (error) {
        console.error('Ошибка отправки письма:', error);
        return false;
    }
}

app.get('/', (req, res) => res.redirect('/register'));

app.get('/auth', (req, res) => {
    if (req.session.user) return res.redirect('/lk');
    res.render('auth', { 
        error: req.session.error,
        message: req.session.message
    });
    delete req.session.error;
    delete req.session.message;
});

app.get('/register', (req, res) => {
    if (req.session.user) return res.redirect('/lk');
    res.render('registration', { 
        error: req.session.error,
        message: req.session.message
    });
    delete req.session.error;
    delete req.session.message;
});

async function loadUsers() {
    try {
        users = await readData(USERS_FILE);
        console.log('Загружено пользователей:', users.length);
    } catch (err) {
        console.error('Ошибка загрузки пользователей:', err);
        users = [];
    }
}


// Вместо ручного добавления пользователей в массив:
app.post('/register', async (req, res) => {
    const { email } = req.body;
    
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        req.session.error = 'Пожалуйста, введите корректный email';
        return res.redirect('/register');
    }
    
    const existingUsers = await readData(USERS_FILE);
    if (existingUsers.some(u => u.email === email)) {
        req.session.error = 'Этот email уже зарегистрирован';
        return res.redirect('/register');
    }
    
    if (availableAccounts.length === 0) {
        req.session.error = 'Извините, в данный момент нет доступных аккаунтов';
        return res.redirect('/register');
    }
    
    const account = availableAccounts.shift();
    const newUser = {
        email,
        account,
        createdAt: new Date().toISOString()
    };
    
    users = [...existingUsers, newUser];
    await writeData(USERS_FILE, users);
    
    const emailSent = await sendAccountEmail(email, account);
    
    if (!emailSent) {
        availableAccounts.unshift(account);
        users.pop();
        req.session.error = 'Ошибка при отправке письма. Попробуйте позже.';
        return res.redirect('/register');
    }
    
    req.session.message = 'На ваш email отправлены данные блокчейн-аккаунта';
    res.redirect('/auth');
});

app.post('/auth', async (req, res) => {
    const { email, blockchain_account } = req.body;
    console.log('Попытка входа для email:', email);
    try {
        users = await readData(USERS_FILE);
        console.log('Все пользователи:', users);
        
        const user = users.find(u => u.email === email);
        console.log('Найденный пользователь:', user);
        
        if (!user) {
            console.log('Пользователь не найден');
            req.session.error = 'Аккаунт не найден. Зарегистрируйтесь сначала.';
            return res.redirect('/auth');
        }
        
        if (user.account !== blockchain_account) {
            console.log('Неверный аккаунт', {
                введенный: blockchain_account,
                ожидаемый: user.account
            });
            req.session.error = 'Неправильный id аккаунта. Попробуйте еще раз.';
            return res.redirect('/auth');
        }
        // Успешная авторизация
        req.session.user = {
            email: user.email,
            account: user.account
        };
        console.log(`Создана сессия пользователя ${email}`)
        // Сохраняем сессию перед редиректом
        req.session.save(err => {
            if (err) {
                console.error('Ошибка сохранения сессии:', err);
                return res.redirect('/auth');
            }
            res.redirect('/lk');
        });

    } catch (err) {
        console.error('Ошибка при авторизации:', err);
        req.session.error = 'Ошибка сервера';
        return res.redirect('/auth');
    }
});

app.get('/lk', async (req, res) => {
    if (!req.session.user) return res.redirect('/auth');
    
    try {
        // Получаем баланс
        //const balance = await web3.eth.getBalance(req.session.user.account);
        const tokenBalance = await marketplaceToken.methods
            .balanceOf(req.session.user.account)
            .call();

        // Получаем историю транзакций 
        const transactions = await getTransactionHistory(req.session.user.account);
        
        // Рассчитываем eco-score
        const ecoScore = calculateEcoScore(transactions);//сюда Юля
        const ecoComment = getEcoComment(ecoScore);//если хош можешь убрать

        // Получаем достижения
        const achievements = await getUserAchievements(req.session.user.account);

        res.render('lk', { 
            user: req.session.user,
            tokenBalance: web3.utils.fromWei(tokenBalance, 'ether'),
            transactions: transactions,
            ecoScore: ecoScore,
            ecoComment: ecoComment,
            achievements: achievements
        });
    } catch (error) {
        console.error('Ошибка получения данных:', error);
        req.session.error = 'Ошибка при получении данных с блокчейна';
        res.redirect('/auth');
    }
});

async function getTransactionHistory(account) {
    // TODO
    // пока пример
    return [
        {
            timestamp: Date.now() - 86400000,
            type: "Перевод",
            amount: "0.5",
            currency: "ETH",
            status: "confirmed"
        },
        {
            timestamp: Date.now() - 172800000,
            type: "Получение токенов",
            amount: "100",
            currency: "Tokens",
            status: "confirmed"
        }
    ];
}

function calculateEcoScore(transactions) {
    const greenTransactions = transactions.filter(tx => tx.type === "Эко-действие").length;
    return Math.min(100, 30 + greenTransactions * 10); // Базовый 30 + 10 за каждое эко-действие
}

function getEcoComment(score) {
    if (score >= 70) return "Отличный результат! Вы настоящий эко-герой!";
    if (score >= 40) return "Хороший результат, но есть куда расти";
    return "Низкий показатель, рекомендуем больше эко-активностей";
}

async function getUserAchievements(account) {
    // TODO
    // пока пример
    return [
        {
            title: "Первая транзакция",
            description: "Совершите первую транзакцию",
            completed: true,
            progress: 100
        },
        {
            title: "Эко-энтузиаст",
            description: "Совершите 5 эко-транзакций",
            completed: false,
            progress: 40
        },
        {
            title: "Коллекционер",
            description: "Получите 3 разных типа токенов",
            completed: false,
            progress: 66
        }
    ];
}
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/auth');
});

const partnersData = require('./partners.json');

app.get('/partners', async (req, res) => {
    if (!req.session.user) return res.redirect('/auth');
    
    try {
        const tokenBalance = await marketplaceToken.methods
            .balanceOf(req.session.user.account)
            .call();
            
        // Передаем error и message из сессии
        res.render('partners', {
            user: req.session.user,
            partners: partnersData,
            tokenBalance: web3.utils.fromWei(tokenBalance, 'ether'),
            error: req.session.error,  // Добавляем
            message: req.session.message  // Добавляем
        });
        
        // Очищаем сообщения после показа
        delete req.session.error;
        delete req.session.message;
        
    } catch (error) {
        console.error('Ошибка:', error);
        req.session.error = 'Ошибка при загрузке данных';
        res.redirect('/lk');
    }
});

app.post('/purchase-bonus', async (req, res) => {
    if (!req.session.user) return res.redirect('/auth');
    
    const { partnerId } = req.body;
    const partner = partnersData.find(p => p.id == partnerId);
    
    if (!partner) {
        req.session.error = 'Бонус не найден';
        return res.redirect('/partners');
    }
    
    try {
        const tokensToSpend = web3.utils.toWei(partner.tokens.toString(), 'ether');
        const balance = await marketplaceToken.methods.balanceOf(req.session.user.account).call();
        
        if (balance < tokensToSpend) {
            req.session.error = 'Недостаточно токенов';
            return res.redirect('/partners');
        }
        
        // Сохраняем покупку
        const purchases = await readData(PURCHASES_FILE);
        const newPurchase = {
            userId: req.session.user.account,
            partnerId: partner.id,
            partnerName: partner.name,
            tokensSpent: partner.tokens,
            date: new Date().toISOString()
        };
        await writeData(PURCHASES_FILE, [...purchases, newPurchase]);
        
        // Выполняем транзакцию
        await marketplaceToken.methods
            .transfer(partner.acc, tokensToSpend)
            .send({ from: req.session.user.account });
            
        req.session.message = `Бонус "${partner.name}" успешно приобретен!`;
        res.redirect('/partners');
    } catch (error) {
        console.error('Ошибка покупки:', error);
        req.session.error = 'Ошибка при покупке бонуса: ' + error.message;
        res.redirect('/partners');
    }
});

const recyclePointsData = require('./recycle-points.json');

// Маршрут для отображения страницы
app.get('/recycle-points', async (req, res) => {
    if (!req.session.user) return res.redirect('/auth');
    
    try {
        const tokenBalance = await marketplaceToken.methods
            .balanceOf(req.session.user.account)
            .call();
            
        res.render('recycle-points', {
            user: req.session.user,
            points: recyclePointsData,
            tokenBalance: web3.utils.fromWei(tokenBalance, 'ether'),
            error: req.session.error,
            message: req.session.message
        });
        
        delete req.session.error;
        delete req.session.message;
    } catch (error) {
        console.error('Ошибка:', error);
        req.session.error = 'Ошибка при загрузке данных';
        res.redirect('/lk');
    }
});

// Маршрут для обработки сдачи отходов
app.post('/recycle-submit', async (req, res) => {
    if (!req.session.user) return res.redirect('/auth');
    
    const { pointId, quantity } = req.body;
    const point = recyclePointsData.find(p => p.id == pointId);
    
    if (!point) {
        req.session.error = 'Пункт приема не найден';
        return res.redirect('/recycle-points');
    }
    
    const quantityNum = parseInt(quantity);
    if (isNaN(quantityNum) || quantityNum <= 0) {
        req.session.error = 'Введите корректное количество (минимум 1)';
        return res.redirect('/recycle-points');
    }
    
    try {
        const reward = quantityNum * point.rewardPerItem;
        const rewardWei = web3.utils.toWei(reward.toString(), 'ether');
        
        // Получаем текущие транзакции
        let transactions = [];
        try {
            transactions = await readData(PURCHASES_FILE);
        } catch (err) {
            console.error('Ошибка чтения истории транзакций:', err);
        }
        
        // Добавляем новую транзакцию
        const newTransaction = {
            userId: req.session.user.account,
            type: "Сдача отходов",
            pointId: point.id,
            pointName: point.name,
            quantity: quantityNum,
            reward: reward,
            date: new Date().toISOString()
        };
        
        // Зачисляем токены
        await marketplaceToken.methods
            .transfer(req.session.user.account, rewardWei)
            .send({ from: process.env.ADMIN_ACCOUNT });
        
        // Сохраняем транзакцию
        await writeData(PURCHASES_FILE, [...transactions, newTransaction]);
        
        req.session.message = `Вы получили ${reward} токенов за сдачу ${quantityNum} единиц отходов!`;
        res.redirect('/recycle-points');
    } catch (error) {
        console.error('Ошибка при сдаче отходов:', error);
        req.session.error = 'Ошибка при обработке транзакции';
        res.redirect('/recycle-points');
    }
});

// Запуск сервера
initAccounts()
    .then(loadUsers)  // Загружаем пользователей при старте
    .then(() => {
        app.listen(port, () => {
            console.log(`Сервер запущен на http://localhost:${port}`);
        });
    })
    .catch(err => {
        console.error('Ошибка инициализации:', err);
        process.exit(1);
    });