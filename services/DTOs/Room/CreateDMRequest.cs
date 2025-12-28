namespace ChatServerMVC.services.DTOs.Room
{
    public class CreateDMRequest
    {
        public Guid FirstUser { get; set; }
        public Guid SecondUser { get; set; }
        public List<byte[]> Keys { get; set; }
    }
}
