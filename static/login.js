document.addEventListener("DOMContentLoaded", () => {
    const loginForm = document.getElementById("login-form");

    loginForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const username = loginForm.username.value;
        if (username) {
            localStorage.setItem("username", username);
            window.location.href = "/chat";
        }
    });
});
