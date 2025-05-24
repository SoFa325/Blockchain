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
const REFUNDING_FILE = path.join(__dirname, 'refindings.json');

async function readData(filePath) {
    try {
        const data = await fs.readFile(filePath, 'utf8');
        return data ? JSON.parse(data) : [];
    } catch (err) {
        if (err.code === 'ENOENT') {
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
        maxAge: 24 * 60 * 60 * 1000
    }
}));

let users = [];
let availableAccounts = [];
let usedAccounts = new Set();

app.use(express.static(path.join(__dirname, 'public')));
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

async function initAccounts() {
    try {
        const accounts = await web3.eth.getAccounts();
        // Исключаем первый аккаунт (обычно это админ)
        availableAccounts = accounts.slice(1); 
        console.log(`Доступно ${availableAccounts.length} аккаунтов для пользователей`);
        
        // Загружаем уже использованные аккаунты из базы
        const existingUsers = await readData(USERS_FILE);
        existingUsers.forEach(user => {
            usedAccounts.add(user.account);
            // Удаляем использованные аккаунты из доступных
            availableAccounts = availableAccounts.filter(acc => acc !== user.account);
        });
        
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
    
    // Берем первый доступный аккаунт
    const account = availableAccounts.shift();
    usedAccounts.add(account);
    
    const newUser = {
        email,
        account,
        createdAt: new Date().toISOString()
    };
    
    users = [...existingUsers, newUser];
    await writeData(USERS_FILE, users);
    
    const emailSent = await sendAccountEmail(email, account);
    
    if (!emailSent) {
        // Если письмо не отправилось, возвращаем аккаунт в доступные
        availableAccounts.unshift(account);
        usedAccounts.delete(account);
        users.pop();
        await writeData(USERS_FILE, users);
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

function getEcoComment(score) {
    if (score >= 80) return "Отличный результат! Вы настоящий эко-герой! 🌱";
    if (score >= 60) return "Хороший результат! Продолжайте в том же духе! 👍";
    if (score >= 40) return "Неплохо, но есть куда расти 💪";
    if (score >= 20) return "Начните с малого - сдайте батарейки или макулатуру ♻️";
    return "Эко-активность отсутствует. Сдайте что-нибудь на переработку!";
}


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


async function getTransactionHistory(userAccount) {
    try {
        // Читаем все виды транзакций
        const purchases = await readData(PURCHASES_FILE);
        const refundings = await readData(REFUNDING_FILE);
        
        // Фильтруем только транзакции текущего пользователя
        const userPurchases = purchases.filter(p => p.userId === userAccount);
        const userRefundings = refundings.filter(r => r.userId === userAccount);
        
        // Форматируем данные для отображения
        const formattedPurchases = userPurchases.map(p => ({
            timestamp: new Date(p.date).getTime(),
            type: "Покупка бонуса",
            partner: p.partnerName,
            amount: p.tokensSpent,
            currency: "Tokens",
            status: "confirmed"
        }));
        
        const formattedRefundings = userRefundings.map(r => ({
            timestamp: new Date(r.date).getTime(),
            type: "Сдача отходов",
            point: r.pointName,
            amount: r.reward,
            currency: "Tokens",
            status: "confirmed"
        }));
        
        // Объединяем и сортируем по дате (новые сверху)
        return [...formattedPurchases, ...formattedRefundings]
            .sort((a, b) => b.timestamp - a.timestamp);
            
    } catch (error) {
        console.error('Ошибка получения истории транзакций:', error);
        return [];
    }
}

function calculateEcoScore(transactions) {
    // Считаем эко-действиями сдачу отходов
    const ecoActions = transactions.filter(tx => tx.type === "Сдача отходов").length;
    const purchasesCount = transactions.filter(tx => tx.type === "Покупка бонуса").length;
    
    // Базовый 30 + 10 за каждое эко-действие, -5 за каждую покупку (максимум 100, минимум 0)
    return Math.max(0, Math.min(100, 30 + (ecoActions * 10) - (purchasesCount * 5)));
}

async function getUserAchievements(userAccount) {
    try {
        const transactions = await getTransactionHistory(userAccount);
        
        const ecoActions = transactions.filter(tx => tx.type === "Сдача отходов").length;
        const purchasesCount = transactions.filter(tx => tx.type === "Покупка бонуса").length;
        const uniquePartners = new Set(
            transactions
                .filter(tx => tx.partner)
                .map(tx => tx.partner)
        ).size;
        
        return [
            {
                title: "Первая транзакция",
                description: "Совершите первую транзакцию",
                completed: transactions.length > 0,
                progress: transactions.length > 0 ? 100 : 0
            },
            {
                title: "Эко-энтузиаст",
                description: "Сдайте отходы 5 раз",
                completed: ecoActions >= 5,
                progress: Math.min(100, (ecoActions / 5) * 100)
            },
            {
                title: "Партнерская программа",
                description: "Воспользуйтесь 3 разными партнерами",
                completed: uniquePartners >= 3,
                progress: Math.min(100, (uniquePartners / 3) * 100)
            },
            {
                title: "Токеновый магнат",
                description: "Получите 100 токенов",
                completed: transactions
                    .filter(tx => tx.type === "Сдача отходов")
                    .reduce((sum, tx) => sum + parseFloat(tx.amount), 0) >= 100,
                progress: Math.min(100, 
                    transactions
                        .filter(tx => tx.type === "Сдача отходов")
                        .reduce((sum, tx) => sum + parseFloat(tx.amount), 0)
                )
            }
        ];
    } catch (error) {
        console.error('Ошибка получения достижений:', error);
        return [];
    }
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
            partnerId: partner.acc,
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
            transactions = await readData(REFUNDING_FILE);
        } catch (err) {
            console.error('Ошибка чтения истории транзакций:', err);
        }
        
        // Добавляем новую транзакцию
        const newTransaction = {
            userId: req.session.user.account,
            pointId: point.acc,
            pointName: point.name,
            reward: reward,
            date: new Date().toISOString(),
            
        };
        
        // Зачисляем токены
        await marketplaceToken.methods
            .transfer(req.session.user.account, rewardWei)
            .send({ from: process.env.ADMIN_ACCOUNT });
        
        // Сохраняем транзакцию
        await writeData(REFUNDING_FILE, [...transactions, newTransaction]);
        
        req.session.message = `Вы получили ${reward} токенов за сдачу ${quantityNum} единиц отходов!`;
        res.redirect('/recycle-points');
    } catch (error) {
        console.error('Ошибка при сдаче отходов:', error);
        req.session.error = 'Ошибка при обработке транзакции';
        res.redirect('/recycle-points');
    }
});

initAccounts()
    .then(loadUsers)
    .then(() => {
        app.listen(port, () => {
            console.log(`Сервер запущен на http://localhost:${port}`);
        });
    })
    .catch(err => {
        console.error('Ошибка инициализации:', err);
        process.exit(1);
    });