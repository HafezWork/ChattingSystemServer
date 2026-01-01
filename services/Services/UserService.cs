using ChatServerMVC.Models;
using ChatServerMVC.services.DTOs.Message;
using ChatServerMVC.services.DTOs.User;
using ChatServerMVC.services.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace ChatServerMVC.services.Services
{
    public class UserService : IUserService
    {
        private readonly IDbContextFactory<DataContext> _dbFactory;


        public UserService(IDbContextFactory<DataContext> dbFactory)
        {
            _dbFactory = dbFactory;
        }
        public async Task<UserResponse> GetUser(string User)
        {
            await using var _db = await _dbFactory.CreateDbContextAsync();
            var userVal = await _db.Users.Where(u => u.UserName == User).FirstAsync();
            if (userVal == null)
            {
                return new UserResponse
                {

                };
            }
            return new UserResponse
            {
                userId = userVal.Id,
                userName = userVal.UserName,
                publicKey = userVal.PublicKey
            };

        }

        public async Task<UserResponse> GetUserById(Guid UserId)
        {
            await using var _db = await _dbFactory.CreateDbContextAsync();
            var userVal = await _db.Users.Where(u => u.Id == UserId).FirstAsync();
            if (userVal == null)
            {
                return new UserResponse
                {

                };
            }
            return new UserResponse
            {
                userId = userVal.Id,
                userName = userVal.UserName,
                publicKey = userVal.PublicKey
            };

        }
    }
}
