using ChatServerMVC.services.DTOs.User;

namespace ChatServerMVC.services.Interfaces
{
    public interface IUserService
    {
     Task<UserResponse> GetUser(string User);
     Task<UserResponse> GetUserById(Guid UserId);
    }
}
