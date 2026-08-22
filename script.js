// --- ВСТАВЬТЕ ВАШИ ДАННЫЕ FIREBASE СЮДА ---
const firebaseConfig = {
    apiKey: "AIzaSyDJnHihyR5I20u9YyOxEGeBW6XYETeZhlg",
    authDomain: "bragadiffstream.firebaseapp.com",
    databaseURL: "https://bragadiffstream-default-rtdb.europe-west1.firebasedatabase.app", // Обязательно проверьте наличие этой строки!
    projectId: "bragadiffstream",
    storageBucket: "bragadiffstream.firebasestorage.app",
    messagingSenderId: "288166776372",
    appId: "1:288166776372:web:323c72cd16e52349b4c461"
};

// Инициализация Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const auth = firebase.auth();

let games = [];
let daToken = localStorage.getItem('daToken') || '';
let centrifuge = null;

// --- СИНХРОНИЗАЦИЯ С ОБЛАКОМ ---
// Этот слушатель работает и у зрителей, и у админа. Как только база меняется — всё обновляется!
db.ref('games').on('value', (snapshot) => {
    games = [];
    snapshot.forEach((child) => {
        games.push({ id: child.key, ...child.val() }); // Собираем массив игр
    });
    render();
});

// --- АВТОРИЗАЦИЯ АДМИНА ---
const loginPanel = document.getElementById('login-panel');
const adminPanel = document.getElementById('admin-panel');

if (loginPanel && adminPanel) {
    auth.onAuthStateChanged((user) => {
        if (user) {
            loginPanel.classList.add('hidden');
            adminPanel.classList.remove('hidden');
            initDA(); // Запускаем прием донатов только если мы авторизованы!
        } else {
            loginPanel.classList.remove('hidden');
            adminPanel.classList.add('hidden');
            if (centrifuge) centrifuge.disconnect();
        }
    });
}

function login() {
    const email = document.getElementById('auth-email').value;
    const pass = document.getElementById('auth-password').value;
    const error = document.getElementById('auth-error');
    
    auth.signInWithEmailAndPassword(email, pass).catch(err => {
        error.textContent = "Ошибка: Неверный логин или пароль";
        error.classList.remove('hidden');
    });
}

function logout() { auth.signOut(); }

// --- DONATIONALERTS ---
function initDA() {
    if (!document.getElementById('da-token-input')) return; // Если мы на странице зрителя - выходим
    
    document.getElementById('da-token-input').value = daToken;
    if (!daToken || !window.Centrifuge) return;

    if (centrifuge) centrifuge.disconnect();
    centrifuge = new Centrifuge('wss://centrifugo.donationalerts.com/connection/websocket');
    
    const statusEl = document.getElementById('da-status');
    centrifuge.on('connecting', () => statusEl.innerHTML = 'Статус: <span class="text-yellow-500">Подключение...</span>');
    centrifuge.on('connected', () => statusEl.innerHTML = 'Статус: <span class="text-green-500 font-bold">Подключено</span>');
    centrifuge.on('disconnected', () => statusEl.innerHTML = 'Статус: <span class="text-red-500">Отключено</span>');

    const sub = centrifuge.newSubscription(`$alerts:donation_${daToken}`);
    sub.on('publication', function(ctx) {
        const donation = ctx.data;
        if (donation.amount >= 50) {
            // Пишем новый донат СРАЗУ В БАЗУ ДАННЫХ
            db.ref('games').push({
                title: donation.message || "Не указана игра",
                viewer: donation.username,
                amount: parseFloat(donation.amount),
                status: 'queue',
                isStreamer: false,
                timestamp: Date.now()
            });
        }
    });
    sub.subscribe();
    centrifuge.connect();
}

function saveDAToken() {
    const token = document.getElementById('da-token-input').value.trim();
    if (token) {
        localStorage.setItem('daToken', token);
        daToken = token;
        initDA();
    }
}

// --- УПРАВЛЕНИЕ ОЧЕРЕДЬЮ (Функции Админа) ---
// Пишем изменения в Firebase, а не в LocalStorage
function setStatus(id, newStatus) {
    if (newStatus === 'playing') {
        // Убираем статус 'playing' у старой игры
        const currentPlaying = games.find(g => g.status === 'playing');
        if (currentPlaying) db.ref('games/' + currentPlaying.id).update({ status: 'completed' });
    }
    db.ref('games/' + id).update({ status: newStatus });
}

function deleteGame(id) {
    db.ref('games/' + id).remove();
}

function clearAll() {
    if(confirm("Точно удалить всё?")) db.ref('games').remove();
}

function addStreamerGame() {
    const input = document.getElementById('streamer-game-input');
    const title = input.value.trim();
    if (!title) return alert("Введите название!");
    
    db.ref('games').push({
        title: title,
        viewer: 'Стример',
        amount: 999999, // Стример всегда топ
        status: 'queue',
        isStreamer: true,
        timestamp: Date.now()
    });
    input.value = '';
}

function simulateDonationAlerts() {
    const fakeGames = ["Dark Souls 3", "Skyrim", "Dota 2", "Minecraft"];
    const fakeAmounts = [50, 150, 500];
    db.ref('games').push({
        title: fakeGames[Math.floor(Math.random() * fakeGames.length)], 
        viewer: "Тестовый_Зритель",
        amount: fakeAmounts[Math.floor(Math.random() * fakeAmounts.length)],
        status: 'queue',
        isStreamer: false,
        timestamp: Date.now()
    });
}

// --- РЕНДЕРИНГ ИНТЕРФЕЙСА ---
function render() {
    const queueList = document.getElementById('queue-list');
    const currentGameEl = document.getElementById('current-game');
    const currentViewerEl = document.getElementById('current-viewer');
    const adminList = document.getElementById('admin-list');

    let playingGame = games.find(g => g.status === 'playing');
    let totalCompleted = games.filter(g => g.status === 'completed').length;

    // Сортировка очереди
    let queueGames = games.filter(g => g.status === 'queue').sort((a, b) => {
        if (a.isStreamer && !b.isStreamer) return -1;
        if (!a.isStreamer && b.isStreamer) return 1;
        if (b.amount !== a.amount) return b.amount - a.amount;
        return a.timestamp - b.timestamp;
    });
    let completedGames = games.filter(g => g.status === 'completed');

    // Рендер страницы зрителя
    if (queueList) {
        queueList.innerHTML = '';
        let queuePosition = 1;

        queueGames.forEach(game => {
            const amountHtml = game.isStreamer ? '<span class="text-yellow-400 font-bold">👑 VIP</span>' : `<span class="text-green-400 font-bold">${game.amount} ₽</span>`;
            queueList.innerHTML += `
                <tr class="hover:bg-gray-750 transition-colors ${game.isStreamer ? 'bg-gray-800/50' : ''}">
                    <td class="p-4 text-gray-400 font-bold">${queuePosition++}</td>
                    <td class="p-4 font-semibold text-lg text-white">${game.title}</td>
                    <td class="p-4 text-purple-400">@${game.viewer}</td>
                    <td class="p-4">${amountHtml}</td>
                    <td class="p-4"><span class="px-2 py-1 text-xs rounded bg-blue-900 text-blue-300">В очереди</span></td>
                </tr>`;
        });

        completedGames.forEach(game => {
            queueList.innerHTML += `
                <tr class="opacity-40 bg-gray-900">
                    <td class="p-4 text-gray-600">-</td>
                    <td class="p-4 line-through">${game.title}</td>
                    <td class="p-4">@${game.viewer}</td>
                    <td class="p-4">-</td>
                    <td class="p-4"><span class="px-2 py-1 text-xs rounded bg-green-900 text-green-300">Пройдена</span></td>
                </tr>`;
        });

        if (playingGame) {
            currentGameEl.textContent = playingGame.title;
            const vipStatus = playingGame.isStreamer ? " (👑 Выбор Стримера)" : ` (${playingGame.amount} ₽)`;
            currentViewerEl.textContent = `Заказал(а): @${playingGame.viewer}${vipStatus}`;
        } else {
            currentGameEl.textContent = "Нет активной игры";
            currentViewerEl.textContent = "Ждем ваших заказов!";
        }

        document.getElementById('stat-total').textContent = games.length;
        document.getElementById('stat-completed').textContent = totalCompleted;
    }

    // Рендер админки
    if (adminList) {
        adminList.innerHTML = '';
        [...(playingGame ? [playingGame] : []), ...queueGames, ...completedGames].forEach(game => {
            const amountText = game.isStreamer ? '👑 Стример' : `${game.amount} ₽`;
            adminList.innerHTML += `
                <tr class="${game.status === 'playing' ? 'bg-purple-50' : ''}">
                    <td class="p-4 font-semibold">${game.title}</td>
                    <td class="p-4">@${game.viewer}</td>
                    <td class="p-4 font-bold text-green-600">${amountText}</td>
                    <td class="p-4 font-bold text-${game.status === 'playing' ? 'purple' : game.status === 'completed' ? 'green' : 'blue'}-600 uppercase text-xs">${game.status}</td>
                    <td class="p-4 space-x-2">
                        <button onclick="setStatus('${game.id}', 'playing')" class="bg-purple-100 text-purple-700 px-3 py-1 rounded text-sm hover:bg-purple-200">Играть</button>
                        <button onclick="setStatus('${game.id}', 'completed')" class="bg-green-100 text-green-700 px-3 py-1 rounded text-sm hover:bg-green-200">Пройдена</button>
                        <button onclick="deleteGame('${game.id}')" class="bg-red-100 text-red-700 px-3 py-1 rounded text-sm hover:bg-red-200">Удалить</button>
                    </td>
                </tr>`;
        });
    }
}
