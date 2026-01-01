namespace ChatServerMVC.services.DTOs.User
{ 
    public class UserResponse
    {
        public string userName { get; set; }
        public Guid userId { get; set; }
        public byte[] publicKey { get; set; }
    }
}
