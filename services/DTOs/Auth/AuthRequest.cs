namespace ChatServerMVC.services.DTOs.Auth
{
    public class RegisterRequest
    {
        public string Username { get; set; }
        public string Password { get; set; }
        public string PublicKey { get; set; }
    }
    public class LoginRequest
    {
        public string Username { get; set; }
        public string Password { get; set; }

    }
}
