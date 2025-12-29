using ChatServerMVC.services;
using Microsoft.AspNetCore.Mvc;

// For more information on enabling Web API for empty projects, visit https://go.microsoft.com/fwlink/?LinkID=397860

namespace ChatServerMVC.Controllers
{
    [ApiController]
    [Route("api/Users")]
    public class UsersController : ControllerBase
    {
        // GET: api/<Users>
        [HttpGet]
        public IEnumerable<WsClient> Get()
        {
            return WebSocketHandler.GetClients();
        }

        // GET api/<Users>/5
        [HttpGet("{id}")]
        public string Get(int id)
        {
            return "User";
        }

        // POST api/<Users>
        [HttpPost]
        public void Post([FromBody] string User)
        {
        }

        // PUT api/<Users>/5
        [HttpPut("{id}")]
        public void Put(int id, [FromBody] string User)
        {
        }

        // DELETE api/<Users>/5
        [HttpDelete("{id}")]
        public void Delete(int id)
        {
        }
    }
}
