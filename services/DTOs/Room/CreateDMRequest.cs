using ChatServerMVC.Models;

namespace ChatServerMVC.services.DTOs.Room
{
    public class CreateDMRequest
    {
        public string SecondUser { get; set; }
        public List<KeyEntry> Keys { get; set; }
    }
}

