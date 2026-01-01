using ChatServerMVC.services;
using ChatServerMVC.services.DTOs.Auth;
using ChatServerMVC.services.DTOs.User;
using ChatServerMVC.services.Interfaces;
using Microsoft.AspNetCore.Mvc;

// For more information on enabling Web API for empty projects, visit https://go.microsoft.com/fwlink/?LinkID=397860

namespace ChatServerMVC.Controllers
{
    [ApiController]
    [Route("api/Users")]

    public class UsersController : ControllerBase
    {
        private readonly IUserService _user;

        public UsersController(IUserService user)
        {
            _user = user;
        }


        // POST api/<Users>
        [HttpPost]
        public async Task<UserResponse> GetUser([FromBody] UserRequest request)
        {
            var response = await _user.GetUser(request.Username);
            return response;
        }

        [HttpPost("GetUserById")]
        public async Task<UserResponse> GetUserById([FromBody] UserRequest request)
        {
            if (request.UserId == null)
                return new UserResponse
                {

                };
            var response = await _user.GetUserById(request.UserId.Value);
            return response;
        }


    }
}
