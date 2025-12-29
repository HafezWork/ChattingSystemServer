using ChatServerMVC.services.DTOs.Key;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace ChatServerMVC.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class KeyController : ControllerBase
    {
        [HttpPost("get")]
        public IActionResult GetKey(GetKeyRequest request)
        {
            return Ok(new GetKeyResponse
            {
            });
        }
    }
}

