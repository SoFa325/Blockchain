
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const { Web3 } = require('web3');
const path = require('path');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
require('dotenv').config();

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
    saveUninitialized: true,
    cookie: { 
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000 // 1 день
    }
}));

app.use(express.static(path.join(__dirname, 'public')));
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

const users = [];
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

app.post('/register', async (req, res) => {
    if (req.session.user) return res.redirect('/lk');
    res.render('registration', { 
        error: req.session.error,
        message: req.session.message
    });
    delete req.session.error;
    delete req.session.message;
    const { email } = req.body;
    
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        req.session.error = 'Пожалуйста, введите корректный email';
        return res.redirect('/register');
    }
    
    if (users.some(u => u.email === email)) {
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
        createdAt: new Date()
    };
    
    users.push(newUser);
    
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
    const { email } = req.body;
    const { blockchain_account } = req.body;
    const user = users.find(u => u.email === email);
    
    if (!user) {
        req.session.error = 'Аккаунт не найден. Зарегистрируйтесь сначала.';
        return res.redirect('/auth');
    }
    if (!(user.account === blockchain_account)){
        req.session.error = 'Неправильный id аккаунта. Попробуйте еще раз.';
        return res.redirect('/auth');
    }
    
    req.session.user = {
        email: user.email,
        account: user.account
    };
    
    res.redirect('/lk');
});

app.get('/lk', async (req, res) => {
    if (!req.session.user) return res.redirect('/auth');
    
    try {
        // Получаем баланс
        const balance = await web3.eth.getBalance(req.session.user.account);
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
            balance: web3.utils.fromWei(balance, 'ether'),
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

// Запуск сервера
initAccounts().then(() => {
    app.listen(port, () => {
        console.log(`Сервер запущен на http://localhost:${port}`);
    });
}).catch(err => {
    console.error('Ошибка инициализации:', err);
    process.exit(1);
});