using ChatServerMVC.services.DTOs.Key;
using ChatServerMVC.services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace ChatServerMVC.Controllers
{
    [Route("api/keys")]
    [Authorize]
    [ApiController]
    public class KeyController : ControllerBase
    {
        private readonly IKeyService _key;

        public KeyController(IKeyService key)
        {
            _key = key;
        }

        [HttpPost("get")]
        public async Task<IActionResult> GetKey(GetKeyRequest request)
        {
            var response = await _key.GetKey(request.PersonalUid, request.RoomId);
            return Ok(new GetKeyResponse
            {
                PersonalShared = response
            });
        }
    }
}

