namespace ChatServerMVC.services.DTOs.Auth
{
    public class AuthResponse
    {
        public Guid UserUid { get; set; }
        public string? JWT { get; set; }
    }
}
