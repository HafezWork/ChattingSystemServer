using Microsoft.AspNetCore.Connections;
using System.Text.Json;

namespace ChatServerMVC.Controllers
{
    public class AuthWsController
    {
        private readonly ITokenValidator _tokenValidator;

        public AuthWsController(ITokenValidator tokenValidator)
        {
            _tokenValidator = tokenValidator;
        }

        public void Authenticate(WsConnectionContext ctx, JsonElement payload)
        {
            var token = payload.GetProperty("token").GetString();

            var userId = _tokenValidator.Validate(token);
            if (userId == null)
            {
                ctx.Socket.Send("{\"type\":\"auth_error\"}");
                ctx.Socket.Close();
                return;
            }

            ctx.UserId = userId;

            ctx.Socket.Send(JsonSerializer.Serialize(new
            {
                type = "auth_ok",
                userId
            }));
        }
    }
}
