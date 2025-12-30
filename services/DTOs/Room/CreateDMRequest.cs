namespace ChatServerMVC.services.DTOs.Room
{
    public class CreateDMRequest
    {
        public Guid SecondUser { get; set; }
        public List<(Guid, byte[])> Keys { get; set; }
    }
}
