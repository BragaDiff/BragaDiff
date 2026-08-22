// Инициализация базы данных
let games = JSON.parse(localStorage.getItem('streamQueue')) || [];
let daToken = localStorage.getItem('daToken') || '';

// Сохранение данных
function saveGames() {
    localStorage.setItem('streamQueue', JSON.stringify(games));
    render();
}

// --- ИНТЕГРАЦИЯ DONATIONALERTS ---
let centrifuge = null;

function initDA() {
    const statusEl = document.getElementById('da-status');
    const tokenInput = document.getElementById('da-token-input');
    
    if (tokenInput && daToken) {
        tokenInput.value = daToken;
    }

    if (!daToken || !window.Centrifuge) return;

    if (centrifuge) centrifuge.disconnect();

    // Подключение к сокетам DA
    centrifuge = new Centrifuge('wss://centrifugo.donationalerts.com/connection/websocket');
    
    centrifuge.on('connecting', () => {
        if (statusEl) statusEl.innerHTML = 'Статус: <span class="font-bold text-yellow-500">Подключение...</span>';
    });

    centrifuge.on('connected', () => {
        if (statusEl) statusEl.innerHTML = 'Статус: <span class="font-bold text-green-500">Подключено (Ждем донаты)</span>';
    });

    centrifuge.on('disconnected', () => {
        if (statusEl) statusEl.innerHTML = 'Статус: <span class="font-bold text-red-500">Отключено</span>';
    });

    // Подписка на канал виджета с токеном
    const sub = centrifuge.newSubscription(`$alerts:donation_${daToken}`);
    
    sub.on('publication', function(ctx) {
        const donation = ctx.data; // Данные пришедшего доната
        
        // Минимальная сумма 50 рублей
        if (donation.amount >= 50) {
            const newDonation = {
                id: Date.now().toString(),
                title: donation.message || "Не указана игра", // DA передает сообщение в message
                viewer: donation.username,
                amount: parseFloat(donation.amount),
                status: 'queue',
                isStreamer: false,
                timestamp: Date.now()
            };

            games.push(newDonation);
            saveGames();
            
            // Если включен звук у браузера, можно добавить alert или звук
            console.log(`Новая игра от ${donation.username}: ${donation.message}`);
        }
    });

    sub.subscribe();
    centrifuge.connect();
}

function saveDAToken() {
    const input = document.getElementById('da-token-input');
    const token = input.value.trim();
    if (token) {
        localStorage.setItem('daToken', token);
        daToken = token;
        initDA();
        alert("Токен сохранен! Идет подключение...");
    }
}

// --- РЕНДЕРИНГ И ЛОГИКА ---
function render() {
    const queueList = document.getElementById('queue-list');
    const currentGameEl = document.getElementById('current-game');
    const currentViewerEl = document.getElementById('current-viewer');
    const adminList = document.getElementById('admin-list');

    let playingGame = games.find(g => g.status === 'playing');
    let totalCompleted = games.filter(g => g.status === 'completed').length;

    let queueGames = games.filter(g => g.status === 'queue');
    queueGames.sort((a, b) => {
        if (a.isStreamer && !b.isStreamer) return -1;
        if (!a.isStreamer && b.isStreamer) return 1;
        if (b.amount !== a.amount) return b.amount - a.amount;
        return a.timestamp - b.timestamp;
    });

    let completedGames = games.filter(g => g.status === 'completed');

    // Рендер зрителя
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
                </tr>
            `;
        });

        completedGames.forEach(game => {
            queueList.innerHTML += `
                <tr class="opacity-40 bg-gray-900">
                    <td class="p-4 text-gray-600">-</td>
                    <td class="p-4 line-through">${game.title}</td>
                    <td class="p-4">@${game.viewer}</td>
                    <td class="p-4">-</td>
                    <td class="p-4"><span class="px-2 py-1 text-xs rounded bg-green-900 text-green-300">Пройдена</span></td>
                </tr>
            `;
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
        const allSortedForAdmin = [...(playingGame ? [playingGame] : []), ...queueGames, ...completedGames];

        allSortedForAdmin.forEach(game => {
            const amountText = game.isStreamer ? '👑 Стример' : `${game.amount} ₽`;
            adminList.innerHTML += `
                <tr class="${game.status === 'playing' ? 'bg-purple-50' : ''}">
                    <td class="p-4 font-semibold">${game.title}</td>
                    <td class="p-4">@${game.viewer}</td>
                    <td class="p-4 font-bold text-green-600">${amountText}</td>
                    <td class="p-4 font-bold text-${game.status === 'playing' ? 'purple' : game.status === 'completed' ? 'green' : 'blue'}-600 uppercase text-xs">
                        ${game.status}
                    </td>
                    <td class="p-4 space-x-2">
                        <button onclick="setStatus('${game.id}', 'playing')" class="bg-purple-100 text-purple-700 px-3 py-1 rounded text-sm hover:bg-purple-200">Играть</button>
                        <button onclick="setStatus('${game.id}', 'completed')" class="bg-green-100 text-green-700 px-3 py-1 rounded text-sm hover:bg-green-200">Пройдена</button>
                        <button onclick="deleteGame('${game.id}')" class="bg-red-100 text-red-700 px-3 py-1 rounded text-sm hover:bg-red-200">Удалить</button>
                    </td>
                </tr>
            `;
        });
    }
}

// Добавление игры стримером
function addStreamerGame() {
    const input = document.getElementById('streamer-game-input');
    const title = input.value.trim();
    if (!title) return alert("Введите название игры!");

    const newGame = { id: Date.now().toString(), title: title, viewer: 'Стример', amount: Infinity, status: 'queue', isStreamer: true, timestamp: Date.now() };
    games.push(newGame);
    saveGames();
    input.value = '';
}

// Управление
function setStatus(id, newStatus) {
    if (newStatus === 'playing') games.forEach(g => { if (g.status === 'playing') g.status = 'completed' });
    const game = games.find(g => g.id === id);
    if (game) game.status = newStatus;
    saveGames();
}

function deleteGame(id) {
    games = games.filter(g => g.id !== id);
    saveGames();
}

function clearAll() {
    if(confirm("Точно удалить всё?")) { games = []; saveGames(); }
}

// Тестовые донаты
function simulateDonationAlerts() {
    const fakeGames = ["Dark Souls 3", "Skyrim", "Resident Evil 4", "Dota 2"];
    const fakeAmounts = [50, 150, 500, 1000];
    const newDonation = {
        id: Date.now().toString(),
        title: fakeGames[Math.floor(Math.random() * fakeGames.length)], 
        viewer: "Тестовый_Зритель",
        amount: fakeAmounts[Math.floor(Math.random() * fakeAmounts.length)],
        status: 'queue',
        isStreamer: false,
        timestamp: Date.now()
    };
    games.push(newDonation);
    saveGames();
}

window.addEventListener('storage', () => {
    games = JSON.parse(localStorage.getItem('streamQueue')) || [];
    render();
});

// Запуск
render();
initDA(); // Пытаемся подключить DA при загрузке страницы
