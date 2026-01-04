namespace ChatServerMVC.services.Interfaces
{
    public interface IAuthService
    {
        Task<Guid> Register(string username, string password, byte[] publicKey);
        Task<(Guid, string)> Login(string username, string password);
        Task<Guid> ValidateToken(string token);
    }
}
