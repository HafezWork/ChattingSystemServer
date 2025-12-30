using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using ChatServerMVC.Models;
using ChatServerMVC.services.Interfaces;
using ChatServerMVC.Utils;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

namespace ChatServerMVC.services.Services
{
    public class AuthService : IAuthService
    {
        private readonly IDbContextFactory<DataContext> _dbFactory;
        private readonly IConfiguration _configuration;
        private readonly string _secret;
        public AuthService(IDbContextFactory<DataContext> dbFactory, IConfiguration configuration)
        {
            _secret = configuration["Jwt:Key"] ?? throw new Exception("JWT key missing in configuration");
            _dbFactory = dbFactory;
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

        public Task<Guid> ValidateToken(string token)
        {
            var tokenHandler = new JwtSecurityTokenHandler();
            var key = Encoding.UTF8.GetBytes(_secret);

            var parameters = new TokenValidationParameters
            {
                ValidateIssuer = false,
                ValidateAudience = false,
                ValidateLifetime = true,
                ValidateIssuerSigningKey = true,
                IssuerSigningKey = new SymmetricSecurityKey(key),
                ClockSkew = TimeSpan.Zero
            };

            var principal = tokenHandler.ValidateToken(token, parameters, out _);
            var userIdClaim = principal.FindFirst(ClaimTypes.NameIdentifier);

            if (userIdClaim == null)
                throw new SecurityTokenException("User ID claim missing in token");

            return Task.FromResult(Guid.Parse(userIdClaim.Value));
        }


        public async Task<Guid> Register(string userName, string password, byte[] publicKey)
        {
            await using var _db = await _dbFactory.CreateDbContextAsync();
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
            await using var _db = await _dbFactory.CreateDbContextAsync();
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
