using System.Security.Policy;
using Microsoft.EntityFrameworkCore;

namespace ChatServerMVC.Models
{
    public class DataContext(string ConnectionString) : DbContext
    {
        private string _connectionString = ConnectionString;
        public DbSet<UserModel> User { get; set; }
        public DbSet<MessageModel> Message { get; set; }
        public DbSet<PublicKeyBundleModel> publicKeyBundle { get; set; }

        protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder)
        {
            optionsBuilder.UseMySQL(_connectionString);
        }
        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            modelBuilder.Entity<UserModel>(entity =>
            {
                entity.HasKey(e => e.Id);
                entity.Property(e => e.UserName).IsRequired();
            });

            modelBuilder.Entity<PublicKeyBundleModel>(entity =>
            {
                entity.HasKey(e => e.UserId);
                entity.Property(e => e.IdentityKey).IsRequired();
                entity.Property(e => e.SignedPreKey).IsRequired();
                entity.Property(e => e.SignedPreKeySignature).IsRequired();

            });
        }
    }
}
