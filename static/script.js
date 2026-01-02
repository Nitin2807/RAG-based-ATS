document.addEventListener("DOMContentLoaded", () => {
    
    // --- Elements ---
    const chatForm = document.getElementById("chat-form");
    const messageInput = document.getElementById("message-input");
    const chatMessages = document.getElementById("chat-messages");
    const sidebar = document.getElementById("sidebar");
    const mainContent = document.getElementById("main-content");
    const toggleSidebarBtn = document.getElementById("toggle-sidebar-btn");
    const openSidebarBtn = document.getElementById("open-sidebar-btn");
    const newChatBtn = document.getElementById("new-chat-btn");
    const chatList = document.getElementById("chat-list");
    const searchInput = document.getElementById("search-chats-input");
    const canvas = document.getElementById('starfield');
    const ctx = canvas.getContext('2d');
    const profileCorner = document.getElementById('profile-corner');
    const pfp = document.getElementById('pfp');
    const profileDropdown = document.getElementById('profile-dropdown');
    const usernameDropdown = document.getElementById('username-dropdown');
    const logoutBtn = document.getElementById('logout-btn');

    // --- Profile Corner ---
    const username = localStorage.getItem("username");
    if (username) {
        usernameDropdown.textContent = username;
        pfp.textContent = username.charAt(0).toUpperCase();
    } else {
        profileCorner.style.display = 'none';
    }

    pfp.addEventListener('click', (event) => {
        event.stopPropagation();
        profileDropdown.classList.toggle('hidden');
    });

    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('username');
        window.location.href = '/';
    });

    window.addEventListener('click', () => {
        if (!profileDropdown.classList.contains('hidden')) {
            profileDropdown.classList.add('hidden');
        }
    });

    profileDropdown.addEventListener('click', (event) => {
        event.stopPropagation();
    });

    // --- State ---
    let chats = []; 
    let currentChatId = null; 

    // --- Starfield Background ---
    // (Starfield code remains the same as previous version)
    let stars = [];
    const numStars = 600; 
    const speed = 0.8; 

    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }

    function createStars() {
        stars = [];
        for (let i = 0; i < numStars; i++) {
            stars.push({
                x: Math.random() * canvas.width - canvas.width / 2, 
                y: Math.random() * canvas.height - canvas.height / 2,
                z: Math.random() * canvas.width, 
                pz: Math.random() * canvas.width 
            });
        }
    }

    function drawStars() {
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2); 

        for (let star of stars) {
            star.z -= speed; 
            if (star.z <= 0) { 
                star.x = Math.random() * canvas.width - canvas.width / 2;
                star.y = Math.random() * canvas.height - canvas.height / 2;
                star.z = canvas.width;
                star.pz = star.z; 
            }

            const k = 256.0 / star.z; 
            const px = star.x * k;
            const py = star.y * k;

            if (px < -canvas.width/2 || px > canvas.width/2 || py < -canvas.height/2 || py > canvas.height/2) {
                star.x = Math.random() * canvas.width - canvas.width / 2;
                star.y = Math.random() * canvas.height - canvas.height / 2;
                star.z = canvas.width;
                star.pz = star.z;
                continue;
            }

            const size = (1 - star.z / canvas.width) * 4; 
            
            const brightness = Math.min(1, Math.max(0.1, (1 - star.z / canvas.width) * (0.4 + Math.random() * 0.6)));
            const colorVal = Math.floor(brightness * 255);
            ctx.fillStyle = `rgb(${colorVal}, ${colorVal}, ${colorVal})`;

            ctx.beginPath();
            ctx.arc(px, py, size / 2, 0, Math.PI * 2);
            ctx.fill();
            
            const prevK = 256.0 / star.pz;
            const prevX = star.x * prevK;
            const prevY = star.y * prevK;
            ctx.strokeStyle = `rgba(${colorVal}, ${colorVal}, ${colorVal}, ${brightness * 0.5})`;
            ctx.lineWidth = size * 0.5; 
            ctx.beginPath();
            ctx.moveTo(prevX, prevY);
            ctx.lineTo(px, py);
            ctx.stroke();
            
            star.pz = star.z; 
        }
        ctx.restore();
    }

    function animateStars() {
        drawStars();
        requestAnimationFrame(animateStars);
    }

    resizeCanvas();
    createStars();
    animateStars();
    window.addEventListener('resize', () => {
        resizeCanvas();
        createStars(); 
    });


    // --- Chat History Management ---

    function loadChats() {
        const storedChats = localStorage.getItem("atsChats");
        chats = storedChats ? JSON.parse(storedChats) : [];
        if (chats.length === 0) {
            startNewChat(); 
        } else {
            const lastChatId = localStorage.getItem("atsLastChatId");
             // Ensure lastChatId is treated as a number for comparison if IDs are numbers
             const lastIdNum = lastChatId ? parseInt(lastChatId, 10) : null;
            loadChat(lastIdNum && chats.some(c => c.id === lastIdNum) ? lastIdNum : chats[0].id);
        }
        renderChatList();
    }

    function saveChats() {
        localStorage.setItem("atsChats", JSON.stringify(chats));
        localStorage.setItem("atsLastChatId", currentChatId);
    }

    // --- MODIFIED: Render Chat List with Delete Button ---
    function renderChatList() {
        chatList.innerHTML = ""; 
        const searchTerm = searchInput.value.toLowerCase();
        const sortedChats = [...chats].sort((a, b) => b.id - a.id); 

        sortedChats.forEach(chat => {
            const chatName = chat.name || `Chat ${new Date(chat.id).toLocaleTimeString()}`;
            const isVisible = searchTerm === "" || chatName.toLowerCase().includes(searchTerm);

            // Create a container for the item and button
            const itemContainer = document.createElement("div");
            itemContainer.classList.add("chat-list-item-container");
            if (!isVisible) {
                itemContainer.classList.add("hidden");
            }

            // Create the chat list item (link)
            const listItem = document.createElement("div");
            listItem.classList.add("chat-list-item");
            listItem.textContent = chatName;
            listItem.dataset.chatId = chat.id; 
            if (chat.id === currentChatId) {
                listItem.classList.add("active");
            }
            listItem.addEventListener("click", () => {
                loadChat(chat.id);
            });

            // Create the delete button
            const deleteBtn = document.createElement("button");
            deleteBtn.classList.add("delete-chat-btn");
            deleteBtn.innerHTML = '<i class="fas fa-times"></i>'; // 'X' icon
            deleteBtn.title = "Delete Chat"; // Tooltip
            deleteBtn.dataset.chatId = chat.id; 
            deleteBtn.addEventListener("click", (event) => {
                event.stopPropagation(); // Prevent triggering the chat load event
                // Optional: Add confirmation dialog
                if (confirm(`Are you sure you want to delete "${chatName}"?`)) {
                     deleteChat(chat.id);
                }
            });

            // Append item and button to the container
            itemContainer.appendChild(listItem);
            itemContainer.appendChild(deleteBtn);
            
            // Append container to the list
            chatList.appendChild(itemContainer);
        });
    }
    // ----------------------------------------------------

    // --- NEW: Delete Chat Function ---
    function deleteChat(chatIdToDelete) {
        // Filter out the chat to be deleted
        chats = chats.filter(chat => chat.id !== chatIdToDelete);
        
        // If the deleted chat was the current chat, load another one
        if (currentChatId === chatIdToDelete) {
            if (chats.length > 0) {
                 // Load the newest remaining chat
                const newestChatId = Math.max(...chats.map(c => c.id));
                loadChat(newestChatId);
            } else {
                // If no chats left, start a new one
                startNewChat();
                return; // startNewChat already saves and renders
            }
        }
        
        saveChats(); // Save the updated chat list
        renderChatList(); // Re-render the sidebar
    }
    // ---------------------------------

    function startNewChat() {
        currentChatId = Date.now(); 
        const newChat = {
            id: currentChatId,
            name: null, 
            messages: [{ sender: "bot", html: "Hello! I'm your resume assistant. Ask me anything about the candidates in the database." }] 
        };
        chats.push(newChat);
        renderMessages(newChat.messages);
        renderChatList(); 
        messageInput.value = "";
        messageInput.focus();
        saveChats();
    }

    function loadChat(chatId) {
         // Ensure chatId is a number if IDs are numbers
         const idToLoad = typeof chatId === 'string' ? parseInt(chatId, 10) : chatId;
        const chatToLoad = chats.find(chat => chat.id === idToLoad);
        if (chatToLoad) {
            currentChatId = idToLoad;
            renderMessages(chatToLoad.messages);
            renderChatList(); 
            localStorage.setItem("atsLastChatId", currentChatId); 
        } else {
            console.error("Chat not found:", idToLoad, "(Original was:", chatId, ")");
            if (chats.length > 0) {
                 const newestChatId = Math.max(...chats.map(c => c.id));
                 loadChat(newestChatId); 
            } else {
                startNewChat(); 
            }
        }
    }

    function renderMessages(messages) {
        chatMessages.innerHTML = ""; 
        messages.forEach(msg => {
            appendMessage(msg.sender, msg.html, false); 
        });
    }

    function appendMessage(sender, messageHTML, save = true) {
        const messageDiv = document.createElement("div");
        messageDiv.classList.add("message", sender === "user" ? "user-message" : "bot-message");
        messageDiv.innerHTML = `<p>${messageHTML}</p>`;
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;

        if (save && currentChatId) {
            // Ensure currentChatId is a number if IDs are numbers
            const currentIdNum = typeof currentChatId === 'string' ? parseInt(currentChatId, 10) : currentChatId;
            const currentChat = chats.find(chat => chat.id === currentIdNum);
            if (currentChat) {
                currentChat.messages.push({ sender: sender, html: messageHTML });
                saveChats(); 
            } else {
                console.error("Could not find current chat to save message:", currentIdNum)
            }
        }
    }

    function showLoadingIndicator() {
        const messageDiv = document.createElement("div");
        messageDiv.classList.add("message", "bot-message", "loading");
        messageDiv.innerHTML = `<p><div class="spinner"></div> Thinking...</p>`;
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return messageDiv;
    }

    // --- Event Listeners ---
    toggleSidebarBtn.addEventListener("click", () => {
        sidebar.classList.add("collapsed");
        mainContent.classList.add("sidebar-collapsed");
    });
    openSidebarBtn.addEventListener("click", () => {
        sidebar.classList.remove("collapsed");
        mainContent.classList.remove("sidebar-collapsed");
    });
    newChatBtn.addEventListener("click", startNewChat);
    searchInput.addEventListener("input", renderChatList);

    chatForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const userMessageText = messageInput.value.trim();
        if (!userMessageText) return;

        appendMessage("user", userMessageText);

        const currentIdNum = typeof currentChatId === 'string' ? parseInt(currentChatId, 10) : currentChatId;
        const currentChat = chats.find(chat => chat.id === currentIdNum);
        if (currentChat && !currentChat.name && currentChat.messages.length === 2) { 
            currentChat.name = userMessageText.substring(0, 30) + (userMessageText.length > 30 ? "..." : "");
            renderChatList(); 
            saveChats();
        }

        messageInput.value = "";
        const loadingMessage = showLoadingIndicator();

        try {
            const response = await fetch("/query", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ question: userMessageText }),
            });

            chatMessages.removeChild(loadingMessage);

            if (!response.ok) {
                const errorData = await response.json();
                const errorMessage = `Error: ${errorData.detail || "Server error"}`;
                appendMessage("bot", errorMessage); 
                return;
            }

            const data = await response.json();
            let botMessageHTML = data.answer_text.replace(/\n/g, "<br>");

            if (data.source_files && data.source_files.length > 0) {
                let linksHTML = '<div class="source-links"><p>Sources:</p>';
                data.source_files.forEach(filename => {
                    linksHTML += `<a href="/get_pdf/${filename}" target="_blank">${filename}</a>`;
                });
                linksHTML += '</div>';
                botMessageHTML += linksHTML;
            }

            appendMessage("bot", botMessageHTML);

        } catch (error) {
            chatMessages.removeChild(loadingMessage);
            console.error("Fetch error:", error);
            appendMessage("bot", "Sorry, connection error. Please try again."); 
        }
    });

    // --- Initial Load ---
    loadChats();

});