using ChatServerMVC.services.DTOs.Auth;
using ChatServerMVC.services.Interfaces;
using Microsoft.AspNetCore.Identity.Data;
using Microsoft.AspNetCore.Mvc;

// For more information on enabling Web API for empty projects, visit https://go.microsoft.com/fwlink/?LinkID=397860

namespace ChatServerMVC.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class AuthController : ControllerBase
    {
        private readonly IAuthService _auth;

        public AuthController(IAuthService auth)
        {
            _auth = auth;
        }
        [HttpPost("register")]
        public async Task<IActionResult> Register(services.DTOs.Auth.RegisterRequest request)
        {
             var response = await _auth.Register(request.Username, request.Password, request.PublicKey);
            return Ok(new AuthResponse
            {
                UserUid = response
            });
        }
        [HttpPost("Login")]
        public async Task<IActionResult> Login(services.DTOs.Auth.LoginRequest request)
        {
            var response = await _auth.Login(request.Username, request.Password);
            return Ok(new AuthResponse
            {
                UserUid = response.Item1,
                JWT = response.Item2
            });
        }
    }
}
