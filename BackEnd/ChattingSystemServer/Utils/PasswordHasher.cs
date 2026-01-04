using System.Security.Cryptography;

namespace ChatServerMVC.Utils
{
    public class PasswordHasher
    {
        public static void Hash(string password, out byte[] hashVal, out byte[] saltVal)
        { 
            byte[] salt = RandomNumberGenerator.GetBytes(16);


            var pbkdf2 = new Rfc2898DeriveBytes(password, salt, 100000, HashAlgorithmName.SHA256);
            hashVal = pbkdf2.GetBytes(20);
            saltVal = salt;
        }

        public static bool Verify(string password, byte[] givenHash, byte[] salt)
        { 


            var pbkdf2 = new Rfc2898DeriveBytes(password, salt, 100000, HashAlgorithmName.SHA256);
            var hashVal = pbkdf2.GetBytes(20);
            var valid = hashVal.SequenceEqual(givenHash);
            return valid;
            
        }
    }
}
