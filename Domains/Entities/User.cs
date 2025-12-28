using System;

namespace ChatServerMVC.Domain.Entities
{
    public class User
    {
        public Guid UserUid { get; set; } = Guid.NewGuid();
        public string Username { get; set; }
        public string Password { get; set; } 
        public string PublicKey { get; set; }
        public string PrivateKey { get; set; } 

        public User(string username, string password, string publicKey)
        {
            Username = username;
            Password = password;
            PublicKey = publicKey;
            PrivateKey = "DUMMY_PRIVATE_KEY";
        }
    }
}
