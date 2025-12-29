using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using ChatServerMVC.Models;
using ChatServerMVC.services.Interfaces;
using ChatServerMVC.Utils;
using Microsoft.IdentityModel.Tokens;

namespace ChatServerMVC.services.Services
{
    public class AuthService : IAuthService
    {
        private readonly DataContext _db;
        private readonly IConfiguration _configuration;

        public AuthService(DataContext db, IConfiguration configuration)
        {
            _db = db;
            _configuration = configuration;
        }

        private string GenerateAccessToken(UserModel user)
        {
            var jwtSettings = _configuration.GetSection("Jwt");
            var key = Encoding.UTF8.GetBytes(jwtSettings["Key"]!);

            var claims = new[]
            {
            new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new Claim(JwtRegisteredClaimNames.Name, user.UserName),
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
            new Claim(ClaimTypes.NameIdentifier, user.Id.ToString())
        };

            var creds = new SigningCredentials(
                new SymmetricSecurityKey(key),
                SecurityAlgorithms.HmacSha256);

            var token = new JwtSecurityToken(
                issuer: jwtSettings["Issuer"],
                audience: jwtSettings["Audience"],
                claims: claims,
                expires: DateTime.UtcNow.AddMinutes(double.Parse(jwtSettings["AccessTokenExpirationMinutes"]!)),
                signingCredentials: creds);

            return new JwtSecurityTokenHandler().WriteToken(token);
        }

        public async Task<Guid> Register(string userName, string password, byte[] publicKey)
        {
            if (_db.Users.Any(u => u.UserName == userName))
            {
                throw new Exception("username exists");
            }
            byte[] passwordHash;
            byte[] salt;
            PasswordHasher.Hash(password, out passwordHash, out salt);
            var user = new UserModel
            {
                Id = Guid.NewGuid(),
                UserName = userName,
                PasswordHash = passwordHash,
                PasswordSalt = salt,
                PublicKey = publicKey
            };
            _db.Users.Add(user);
            await _db.SaveChangesAsync();
            return user.Id;
        }

        public async Task<(Guid, string)> Login(string userName, string password)
        {
            if (!_db.Users.Any(u => u.UserName == userName))
            {
                throw new Exception("username not found!");
            }
            UserModel user = _db.Users.First(e => e.UserName == userName);
            if (user == null)
            {
                throw new Exception("username not found!");
            }
            if (!PasswordHasher.Verify(password, user.PasswordHash, user.PasswordSalt))
            {
                throw new Exception("Invalid Credentials!");
            }

            return (user.Id, GenerateAccessToken(user));


        }
    }
}
